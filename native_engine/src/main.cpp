#include "../include/ipc_message_bus.hpp"
#include "../include/network_fetcher.hpp"
#include "../include/database_store.hpp"
#include "../include/renderer_process.hpp"
#include "../include/browser_main_process.hpp"

#include <iostream>
#include <thread>
#include <chrono>

int main() {
    std::cout << "========================================================================\n";
    std::cout << "          BLACK BROWSER CUSTOM NATIVE BACKEND SYSTEM ARCHITECTURE       \n";
    std::cout << "========================================================================\n\n";

    // 1. Initialize Main Browser Process & Multi-Process Architecture
    std::cout << "[System] Initializing Main Browser Process & IPC Infrastructure...\n";
    auto browser_main = std::make_unique<BlackEngine::BrowserMainProcess>();
    browser_main->start();

    std::this_thread::sleep_for(std::chrono::milliseconds(500));

    // 2. Perform Async Network Requests & IPC Navigation Dispatches
    std::cout << "\n[System] Dispatching navigation & network requests across processes...\n";
    browser_main->navigate_to("RENDERER_PROC_1", "https://google.com");
    browser_main->navigate_to("RENDERER_PROC_2", "https://github.com/shivamkumarmehta64-sketch/Black");

    std::this_thread::sleep_for(std::chrono::milliseconds(800));

    // 3. Populate Encrypted Bookmarks and User History in SQLite Store
    std::cout << "\n[System] Storing encrypted user bookmarks & persistent state...\n";
    const std::string master_pass = "BlackSuperSecretPassphrase2026!";
    browser_main->add_encrypted_bookmark("https://google.com", "Google Search Engine", master_pass);
    browser_main->add_encrypted_bookmark("https://github.com/shivamkumarmehta64-sketch/Black", "Black Browser GitHub Repo", master_pass);

    std::this_thread::sleep_for(std::chrono::milliseconds(500));

    // 4. Output Persistent SQLite Schema & Storage Summary
    browser_main->print_database_summary(master_pass);

    // 5. Clean Shutdown of Process Threads & IPC Bus
    std::cout << "[System] Terminating processes and cleaning up memory safety guards...\n";
    browser_main->stop();

    std::cout << "\n[System] Custom Web Browser Backend execution finished cleanly.\n";
    return 0;
}
