#ifndef BROWSER_MAIN_PROCESS_HPP
#define BROWSER_MAIN_PROCESS_HPP

#include "ipc_message_bus.hpp"
#include "network_fetcher.hpp"
#include "database_store.hpp"
#include "renderer_process.hpp"

#include <string>
#include <vector>
#include <memory>
#include <thread>
#include <atomic>
#include <iostream>
#include <unordered_map>

namespace BlackEngine {

class BrowserMainProcess {
public:
    BrowserMainProcess()
        : ipc_bus_(std::make_shared<IPCMessageBus>()),
          network_fetcher_(std::make_unique<AsyncNetworkFetcher>()),
          db_store_(std::make_unique<SQLiteDatabaseStore>("black_browser_data.db")),
          is_running_(false) {}

    ~BrowserMainProcess() {
        stop();
    }

    void start() {
        is_running_ = true;
        
        // Spawn active renderer processes
        spawn_renderer_process("RENDERER_PROC_1");
        spawn_renderer_process("RENDERER_PROC_2");

        main_loop_thread_ = std::thread(&BrowserMainProcess::main_loop, this);
    }

    void stop() {
        if (is_running_) {
            is_running_ = false;

            // Signal shutdown to renderer processes
            IPCMessage shutdown_msg;
            shutdown_msg.message_id = "MSG_SHUTDOWN";
            shutdown_msg.type = MessageType::SHUTDOWN_SIGNAL;
            shutdown_msg.sender_process = "MAIN_BROWSER_PROCESS";
            shutdown_msg.target_process = "ALL_RENDERERS";
            shutdown_msg.timestamp = std::chrono::system_clock::now().time_since_epoch().count();
            ipc_bus_->send_message(shutdown_msg);

            for (auto& pair : renderers_) {
                pair.second->stop();
            }

            if (main_loop_thread_.joinable()) {
                main_loop_thread_.join();
            }

            ipc_bus_->shutdown();
        }
    }

    void navigate_to(const std::string& renderer_id, const std::string& url) {
        std::cout << "[MainBrowserProcess] Initiating Navigation to: " << url << " on target: " << renderer_id << "\n";

        // 1. Save to SQLite History Store
        db_store_->add_history_entry(url, "Loading...");

        // 2. Perform Async Network Fetch
        auto fetch_future = network_fetcher_->fetch_async(url);

        // 3. Dispatch IPC Navigation Request to target Renderer Process
        IPCMessage nav_msg;
        nav_msg.message_id = "MSG_NAV_" + std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
        nav_msg.type = MessageType::NAVIGATE_REQUEST;
        nav_msg.sender_process = "MAIN_BROWSER_PROCESS";
        nav_msg.target_process = renderer_id;
        nav_msg.payload = url;
        nav_msg.timestamp = std::chrono::system_clock::now().time_since_epoch().count();

        ipc_bus_->send_message(nav_msg);
    }

    void add_encrypted_bookmark(const std::string& url, const std::string& title, const std::string& master_key) {
        db_store_->add_encrypted_bookmark(url, title, master_key);
        std::cout << "[MainBrowserProcess] Saved encrypted bookmark: " << url << "\n";
    }

    void print_database_summary(const std::string& master_key) {
        std::cout << "\n================ [SQLITE PERSISTENT STORAGE SUMMARY] ================\n";
        auto history = db_store_->get_all_history();
        std::cout << "--- Browsing History Table (" << history.size() << " records) ---\n";
        for (const auto& rec : history) {
            std::cout << "  [ID: " << rec.id << "] " << rec.url << " | Title: " << rec.title 
                      << " | Visits: " << rec.visit_count << " | TS: " << rec.last_visited_ts << "\n";
        }

        auto bookmarks = db_store_->get_all_bookmarks();
        std::cout << "--- Encrypted Bookmarks Table (" << bookmarks.size() << " records) ---\n";
        for (const auto& b : bookmarks) {
            std::string decrypted = db_store_->decrypt_bookmark_title(b, master_key);
            std::cout << "  [ID: " << b.id << "] " << b.url << " | Encrypted Hex: " << b.encrypted_title 
                      << " | Decrypted Title: " << decrypted << " | IV: " << b.nonce_iv << "\n";
        }
        std::cout << "====================================================================\n\n";
    }

    std::shared_ptr<IPCMessageBus> get_ipc_bus() {
        return ipc_bus_;
    }

private:
    std::shared_ptr<IPCMessageBus> ipc_bus_;
    std::unique_ptr<AsyncNetworkFetcher> network_fetcher_;
    std::unique_ptr<SQLiteDatabaseStore> db_store_;
    std::unordered_map<std::string, std::shared_ptr<RendererProcess>> renderers_;
    
    std::atomic<bool> is_running_;
    std::thread main_loop_thread_;

    void spawn_renderer_process(const std::string& proc_id) {
        auto proc = std::make_shared<RendererProcess>(proc_id, ipc_bus_);
        proc->start();
        renderers_[proc_id] = proc;
    }

    void main_loop() {
        std::cout << "[MainBrowserProcess] Started main event coordinator loop.\n";
        
        while (is_running_) {
            IPCMessage msg;
            if (ipc_bus_->receive_message(msg, 200)) {
                if (msg.target_process == "MAIN_BROWSER_PROCESS") {
                    handle_ipc_message(msg);
                }
            }
        }

        std::cout << "[MainBrowserProcess] Terminating event loop.\n";
    }

    void handle_ipc_message(const IPCMessage& msg) {
        if (msg.type == MessageType::DOM_RENDER_COMMAND) {
            std::cout << "[MainBrowserProcess] Received DOM_RENDER_COMMAND from " << msg.sender_process 
                      << " Payload size: " << msg.payload.length() << " bytes.\n";
        }
    }
};

} // namespace BlackEngine

#endif // BROWSER_MAIN_PROCESS_HPP
