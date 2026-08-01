#ifndef RENDERER_PROCESS_HPP
#define RENDERER_PROCESS_HPP

#include "ipc_message_bus.hpp"
#include <string>
#include <memory>
#include <thread>
#include <atomic>
#include <iostream>

namespace BlackEngine {

class RendererProcess {
public:
    RendererProcess(const std::string& process_id, std::shared_ptr<IPCMessageBus> bus)
        : process_id_(process_id), ipc_bus_(bus), is_running_(false) {}

    ~RendererProcess() {
        stop();
    }

    void start() {
        is_running_ = true;
        worker_thread_ = std::thread(&RendererProcess::process_loop, this);
    }

    void stop() {
        if (is_running_) {
            is_running_ = false;
            if (worker_thread_.joinable()) {
                worker_thread_.join();
            }
        }
    }

    std::string get_process_id() const {
        return process_id_;
    }

private:
    std::string process_id_;
    std::shared_ptr<IPCMessageBus> ipc_bus_;
    std::atomic<bool> is_running_;
    std::thread worker_thread_;

    void process_loop() {
        std::cout << "[RendererProcess " << process_id_ << "] Initialized sandboxed render loop.\n";
        
        while (is_running_) {
            IPCMessage msg;
            if (ipc_bus_->receive_message(msg, 200)) {
                if (msg.target_process == process_id_ || msg.target_process == "ALL_RENDERERS") {
                    handle_ipc_message(msg);
                }
            }
        }

        std::cout << "[RendererProcess " << process_id_ << "] Terminated cleanly.\n";
    }

    void handle_ipc_message(const IPCMessage& msg) {
        switch (msg.type) {
            case MessageType::NAVIGATE_REQUEST: {
                std::cout << "[RendererProcess " << process_id_ << "] Processing NAVIGATE_REQUEST to URL: " << msg.payload << "\n";
                
                // Simulate parsing & DOM tokenization
                std::string dom_tree = "<root><head><title>Parsed</title></head><body>Rendered DOM Content</body></root>";

                // Dispatch render command response back to main browser process
                IPCMessage response;
                response.message_id = "MSG_RENDER_" + std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
                response.type = MessageType::DOM_RENDER_COMMAND;
                response.sender_process = process_id_;
                response.target_process = "MAIN_BROWSER_PROCESS";
                response.payload = dom_tree;
                response.timestamp = std::chrono::system_clock::now().time_since_epoch().count();

                ipc_bus_->send_message(response);
                break;
            }

            case MessageType::SHUTDOWN_SIGNAL: {
                std::cout << "[RendererProcess " << process_id_ << "] Received SHUTDOWN_SIGNAL.\n";
                is_running_ = false;
                break;
            }

            default:
                break;
        }
    }
};

} // namespace BlackEngine

#endif // RENDERER_PROCESS_HPP
