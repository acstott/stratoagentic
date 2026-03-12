#include <gdal_priv.h>
#include <cpl_conv.h>
#include <ogr_spatialref.h>

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace fs = std::filesystem;

struct Config {
    std::string inputPath;
    std::string outputDir;
    int tileWidth = 512;
    int tileHeight = 512;
};

struct TileMetadata {
    std::string file;
    int tileX;
    int tileY;
    int pixelX;
    int pixelY;
    int width;
    int height;
    double minLon;
    double minLat;
    double maxLon;
    double maxLat;
};

class RasterTiler {
public:
    explicit RasterTiler(Config cfg) : cfg_(std::move(cfg)) {}

    int run() {
        GDALAllRegister();

        openSource();
        createOutputDir();
        tileRaster();
        writeTileIndex();

        GDALClose(src_);
        src_ = nullptr;
        return 0;
    }

private:
    Config cfg_;
    GDALDataset* src_ = nullptr;
    std::vector<TileMetadata> tiles_;

    void openSource() {
        src_ = static_cast<GDALDataset*>(GDALOpen(cfg_.inputPath.c_str(), GA_ReadOnly));
        if (!src_) {
            throw std::runtime_error("Failed to open raster: " + cfg_.inputPath);
        }

        std::cout << "Raster size: "
                  << src_->GetRasterXSize() << " x "
                  << src_->GetRasterYSize() << '\n';

        std::cout << "Bands: " << src_->GetRasterCount() << '\n';

        GDALRasterBand* band1 = src_->GetRasterBand(1);
        if (!band1) {
            throw std::runtime_error("Raster has no band 1.");
        }

        std::cout << "Band 1 type: " << GDALGetDataTypeName(band1->GetRasterDataType()) << '\n';
        std::cout << "Band 1 color interp: " << GDALGetColorInterpretationName(band1->GetColorInterpretation()) << '\n';
        std::cout << "Palette present: " << (band1->GetColorTable() ? "yes" : "no") << '\n';
    }

    void createOutputDir() {
        if (!fs::exists(cfg_.outputDir)) {
            fs::create_directories(cfg_.outputDir);
        }
    }

    bool isPalettedSource() const {
        if (!src_ || src_->GetRasterCount() != 1) {
            return false;
        }

        GDALRasterBand* band1 = src_->GetRasterBand(1);
        if (!band1) {
            return false;
        }

        return band1->GetColorTable() != nullptr &&
               band1->GetColorInterpretation() == GCI_PaletteIndex;
    }

    bool hasGeoTransform(double gt[6]) const {
        return src_->GetGeoTransform(gt) == CE_None;
    }

    void pixelToGeo(const double gt[6], double px, double py, double& x, double& y) const {
        x = gt[0] + px * gt[1] + py * gt[2];
        y = gt[3] + px * gt[4] + py * gt[5];
    }

    void tileRaster() {
        const int rasterX = src_->GetRasterXSize();
        const int rasterY = src_->GetRasterYSize();

        double geoTransform[6] = {0, 1, 0, 0, 0, -1};
        const bool hasGT = hasGeoTransform(geoTransform);

        if (!hasGT) {
            throw std::runtime_error("Source raster has no geotransform; raster placement requires georeferencing.");
        }

        GDALDriver* pngDriver = GetGDALDriverManager()->GetDriverByName("PNG");
        if (!pngDriver) {
            throw std::runtime_error("PNG driver not available.");
        }

        GDALDriver* memDriver = GetGDALDriverManager()->GetDriverByName("MEM");
        if (!memDriver) {
            throw std::runtime_error("MEM driver not available.");
        }

        const bool paletted = isPalettedSource();
        if (paletted) {
            std::cout << "Source is paletted; output tiles will be converted to RGB PNG.\n";
        }

        int tileX = 0;
        for (int xOff = 0; xOff < rasterX; xOff += cfg_.tileWidth, ++tileX) {
            int tileY = 0;
            for (int yOff = 0; yOff < rasterY; yOff += cfg_.tileHeight, ++tileY) {
                const int winX = std::min(cfg_.tileWidth, rasterX - xOff);
                const int winY = std::min(cfg_.tileHeight, rasterY - yOff);

                const std::string fileName =
                    "tile_" + std::to_string(tileX) + "_" + std::to_string(tileY) + ".png";
                const std::string outFile = cfg_.outputDir + "/" + fileName;

                writePngTile(memDriver, pngDriver, outFile, xOff, yOff, winX, winY);

                double x0, y0, x1, y1;
                pixelToGeo(geoTransform, static_cast<double>(xOff), static_cast<double>(yOff), x0, y0);
                pixelToGeo(geoTransform, static_cast<double>(xOff + winX), static_cast<double>(yOff + winY), x1, y1);

                TileMetadata md;
                md.file = fileName;
                md.tileX = tileX;
                md.tileY = tileY;
                md.pixelX = xOff;
                md.pixelY = yOff;
                md.width = winX;
                md.height = winY;
                md.minLon = std::min(x0, x1);
                md.maxLon = std::max(x0, x1);
                md.minLat = std::min(y0, y1);
                md.maxLat = std::max(y0, y1);

                tiles_.push_back(md);

                std::cout << "Wrote " << outFile << '\n';
            }
        }
    }

    void writePngTile(
        GDALDriver* memDriver,
        GDALDriver* pngDriver,
        const std::string& path,
        int xOff,
        int yOff,
        int winX,
        int winY
    ) {
        GDALRasterBand* srcBand1 = src_->GetRasterBand(1);
        if (!srcBand1) {
            throw std::runtime_error("Missing source band 1.");
        }

        GDALDataset* memTile = memDriver->Create("", winX, winY, 3, GDT_Byte, nullptr);
        if (!memTile) {
            throw std::runtime_error("Failed to create in-memory tile.");
        }

        try {
            if (isPalettedSource()) {
                writePalettedRgbTile(memTile, xOff, yOff, winX, winY);
            } else {
                writeRgbOrGrayTile(memTile, xOff, yOff, winX, winY);
            }

            GDALDataset* outTile = pngDriver->CreateCopy(
                path.c_str(),
                memTile,
                FALSE,
                nullptr,
                nullptr,
                nullptr
            );

            if (!outTile) {
                throw std::runtime_error("Failed to write PNG tile: " + path);
            }

            GDALClose(outTile);
            GDALClose(memTile);
        } catch (...) {
            GDALClose(memTile);
            throw;
        }
    }

    void writeRgbOrGrayTile(GDALDataset* tile, int xOff, int yOff, int winX, int winY) {
        const int bandCount = src_->GetRasterCount();

        std::vector<uint8_t> r(static_cast<size_t>(winX) * static_cast<size_t>(winY));
        std::vector<uint8_t> g(static_cast<size_t>(winX) * static_cast<size_t>(winY));
        std::vector<uint8_t> b(static_cast<size_t>(winX) * static_cast<size_t>(winY));

        if (bandCount >= 3) {
            readBandAsByte(src_->GetRasterBand(1), xOff, yOff, winX, winY, r);
            readBandAsByte(src_->GetRasterBand(2), xOff, yOff, winX, winY, g);
            readBandAsByte(src_->GetRasterBand(3), xOff, yOff, winX, winY, b);
        } else {
            std::vector<uint8_t> gray(static_cast<size_t>(winX) * static_cast<size_t>(winY));
            readBandAsByte(src_->GetRasterBand(1), xOff, yOff, winX, winY, gray);

            r = gray;
            g = gray;
            b = gray;
        }

        writeByteBand(tile->GetRasterBand(1), winX, winY, r);
        writeByteBand(tile->GetRasterBand(2), winX, winY, g);
        writeByteBand(tile->GetRasterBand(3), winX, winY, b);
    }

    void writePalettedRgbTile(GDALDataset* tile, int xOff, int yOff, int winX, int winY) {
        GDALRasterBand* srcBand = src_->GetRasterBand(1);
        if (!srcBand) {
            throw std::runtime_error("Paletted source missing band 1.");
        }

        const GDALColorTable* colorTable = srcBand->GetColorTable();
        if (!colorTable) {
            throw std::runtime_error("Expected color table for paletted source.");
        }

        std::vector<uint8_t> indexBuffer(static_cast<size_t>(winX) * static_cast<size_t>(winY));
        std::vector<uint8_t> red(static_cast<size_t>(winX) * static_cast<size_t>(winY));
        std::vector<uint8_t> green(static_cast<size_t>(winX) * static_cast<size_t>(winY));
        std::vector<uint8_t> blue(static_cast<size_t>(winX) * static_cast<size_t>(winY));

        CPLErr readErr = srcBand->RasterIO(
            GF_Read,
            xOff,
            yOff,
            winX,
            winY,
            indexBuffer.data(),
            winX,
            winY,
            GDT_Byte,
            0,
            0,
            nullptr
        );

        if (readErr != CE_None) {
            throw std::runtime_error("Failed reading paletted source tile.");
        }

        for (size_t i = 0; i < indexBuffer.size(); ++i) {
            const int paletteIndex = static_cast<int>(indexBuffer[i]);
            const GDALColorEntry* entry = colorTable->GetColorEntry(paletteIndex);

            if (entry) {
                red[i] = static_cast<uint8_t>(entry->c1);
                green[i] = static_cast<uint8_t>(entry->c2);
                blue[i] = static_cast<uint8_t>(entry->c3);
            } else {
                red[i] = 0;
                green[i] = 0;
                blue[i] = 0;
            }
        }

        writeByteBand(tile->GetRasterBand(1), winX, winY, red);
        writeByteBand(tile->GetRasterBand(2), winX, winY, green);
        writeByteBand(tile->GetRasterBand(3), winX, winY, blue);
    }

    void readBandAsByte(
        GDALRasterBand* band,
        int xOff,
        int yOff,
        int winX,
        int winY,
        std::vector<uint8_t>& out
    ) {
        if (!band) {
            throw std::runtime_error("Null source band.");
        }

        CPLErr err = band->RasterIO(
            GF_Read,
            xOff,
            yOff,
            winX,
            winY,
            out.data(),
            winX,
            winY,
            GDT_Byte,
            0,
            0,
            nullptr
        );

        if (err != CE_None) {
            throw std::runtime_error("Failed reading raster band.");
        }
    }

    void writeByteBand(GDALRasterBand* band, int winX, int winY, const std::vector<uint8_t>& data) {
        if (!band) {
            throw std::runtime_error("Null destination band.");
        }

        CPLErr err = band->RasterIO(
            GF_Write,
            0,
            0,
            winX,
            winY,
            const_cast<uint8_t*>(data.data()),
            winX,
            winY,
            GDT_Byte,
            0,
            0,
            nullptr
        );

        if (err != CE_None) {
            throw std::runtime_error("Failed writing PNG band.");
        }
    }

    void writeTileIndex() {
        const std::string indexPath = cfg_.outputDir + "/tile_index.json";
        std::ofstream out(indexPath);
        if (!out) {
            throw std::runtime_error("Failed to open tile index for writing: " + indexPath);
        }

        out << "{\n";
        out << "  \"tiles\": [\n";

        for (size_t i = 0; i < tiles_.size(); ++i) {
            const auto& t = tiles_[i];
            out << "    {\n";
            out << "      \"file\": \"" << t.file << "\",\n";
            out << "      \"tileX\": " << t.tileX << ",\n";
            out << "      \"tileY\": " << t.tileY << ",\n";
            out << "      \"pixelX\": " << t.pixelX << ",\n";
            out << "      \"pixelY\": " << t.pixelY << ",\n";
            out << "      \"width\": " << t.width << ",\n";
            out << "      \"height\": " << t.height << ",\n";
            out << std::fixed << std::setprecision(8);
            out << "      \"minLon\": " << t.minLon << ",\n";
            out << "      \"minLat\": " << t.minLat << ",\n";
            out << "      \"maxLon\": " << t.maxLon << ",\n";
            out << "      \"maxLat\": " << t.maxLat << "\n";
            out << "    }";
            if (i + 1 < tiles_.size()) {
                out << ",";
            }
            out << "\n";
        }

        out << "  ]\n";
        out << "}\n";

        std::cout << "Wrote " << indexPath << '\n';
    }
};

Config parseArgs(int argc, char** argv) {
    if (argc < 3) {
        throw std::runtime_error(
            "Usage: raster_tiler <input.tif> <output_dir> [tile_w] [tile_h]"
        );
    }

    Config cfg;
    cfg.inputPath = argv[1];
    cfg.outputDir = argv[2];

    if (argc >= 4) {
        cfg.tileWidth = std::stoi(argv[3]);
    }
    if (argc >= 5) {
        cfg.tileHeight = std::stoi(argv[4]);
    }

    if (cfg.tileWidth <= 0 || cfg.tileHeight <= 0) {
        throw std::runtime_error("Tile dimensions must be positive integers.");
    }

    return cfg;
}

int main(int argc, char** argv) {
    try {
        Config cfg = parseArgs(argc, argv);
        RasterTiler tiler(std::move(cfg));
        return tiler.run();
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << '\n';
        return 1;
    }
}