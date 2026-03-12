cmake_minimum_required(VERSION 3.16)
project(raster_tiler LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(GDAL REQUIRED)

add_executable(raster_tiler
    src/main.cpp
)

target_include_directories(raster_tiler PRIVATE ${GDAL_INCLUDE_DIRS})
target_link_libraries(raster_tiler PRIVATE ${GDAL_LIBRARIES})