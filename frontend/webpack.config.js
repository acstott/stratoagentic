import path from "path";
import HtmlWebpackPlugin from "html-webpack-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";
import webpack from "webpack";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mode =
  process.env.NODE_ENV === "production"
    ? "production"
    : process.env.NODE_ENV === "none"
      ? "none"
      : "development";

/** @type {import("webpack").Configuration} */
export default {
  context: __dirname,
  mode,

  entry: "./src/index.tsx",

  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
    publicPath: "/",
    clean: true,
    sourcePrefix: ""
  },

  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    fallback: {
      fs: false,
      path: false,
      http: false,
      https: false,
      zlib: false,
      url: false
    }
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.resolve(__dirname, "tsconfig.json")
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"]
      },
      {
        test: /\.(png|gif|jpg|jpeg|svg|xml|json|glb|gltf|bin)$/i,
        type: "asset/resource"
      }
    ]
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: "./public/index.html"
    }),

    new webpack.DefinePlugin({
      CESIUM_BASE_URL: JSON.stringify("/cesium"),
      WS_BASE_URL: JSON.stringify(process.env.WS_BASE_URL || "")
    }),

    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(__dirname, "node_modules/cesium/Build/Cesium/Workers"),
          to: "cesium/Workers"
        },
        {
          from: path.join(__dirname, "node_modules/cesium/Build/Cesium/Assets"),
          to: "cesium/Assets"
        },
        {
          from: path.join(__dirname, "node_modules/cesium/Build/Cesium/Widgets"),
          to: "cesium/Widgets"
        }
      ]
    })
  ],

  devServer: {
    host: "0.0.0.0",
    port: 3000,
    historyApiFallback: true,
    hot: true,
    allowedHosts: "all",

    proxy: [
      {
        context: ["/api"],
        target: "http://backend:8080",
        changeOrigin: true,
        ws: false,
        logLevel: "debug",
        onError(err, req, res) {
          console.error("proxy /api error:", err?.message ?? err);
          if (res && !res.headersSent) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("API proxy error");
          }
        }
      },
      {
        context: ["/stream"],
        target: "ws://backend:8080",
        ws: true,
        changeOrigin: true,
        logLevel: "debug",
        onError(err, req, res) {
          console.error("proxy /stream error:", err?.message ?? err);
          try {
            if (res && !res.headersSent) {
              res.writeHead(502, { "Content-Type": "text/plain" });
              res.end("WS proxy error");
            }
          } catch {
            // ignore ws proxy response handling edge cases
          }
        }
      },
      {
        context: ["/raster"],
        target: "http://backend:8080",
        changeOrigin: true,
        ws: false,
        logLevel: "debug",
        onError(err, req, res) {
          console.error("proxy /raster error:", err?.message ?? err);
          if (res && !res.headersSent) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Raster proxy error");
          }
        }
      }
    ]
  }
};