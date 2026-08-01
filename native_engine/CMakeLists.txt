cmake_minimum_required(VERSION 3.14)
project(BlackBrowserNativeEngine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Include directories
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)

# Source files
set(SOURCES
    src/main.cpp
)

# Executable target
add_executable(black_engine ${SOURCES})

# Target features & compile options
if(MSVC)
    target_compile_options(black_engine PRIVATE /W4 /EHsc)
else()
    target_compile_options(black_engine PRIVATE -Wall -Wextra -Wpedantic -O2)
endif()
