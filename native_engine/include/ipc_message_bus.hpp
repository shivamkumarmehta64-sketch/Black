#ifndef IPC_MESSAGE_BUS_HPP
#define IPC_MESSAGE_BUS_HPP

#include <string>
#include <vector>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <memory>
#include <sstream>
#include <iostream>
#include <chrono>

namespace BlackEngine {

enum class MessageType {
    NAVIGATE_REQUEST,
    DOM_RENDER_COMMAND,
    NETWORK_FETCH_REQUEST,
    NETWORK_FETCH_RESPONSE,
    STORAGE_WRITE_REQUEST,
    STORAGE_WRITE_RESPONSE,
    PROCESS_HEALTH_CHECK,
    SHUTDOWN_SIGNAL
};

struct IPCMessage {
    std::string message_id;
    MessageType type;
    std::string sender_process;
    std::string target_process;
    std::string payload;
    uint64_t timestamp;

    std::string serialize() const {
        std::ostringstream ss;
        ss << message_id << "|"
           << static_cast<int>(type) << "|"
           << sender_process << "|"
           << target_process << "|"
           << timestamp << "|"
           << payload;
        return ss.str();
    }

    static IPCMessage deserialize(const std::string& raw) {
        IPCMessage msg;
        std::stringstream ss(raw);
        std::string token;

        if (std::getline(ss, token, '|')) msg.message_id = token;
        if (std::getline(ss, token, '|')) msg.type = static_cast<MessageType>(std::stoi(token));
        if (std::getline(ss, token, '|')) msg.sender_process = token;
        if (std::getline(ss, token, '|')) msg.target_process = token;
        if (std::getline(ss, token, '|')) msg.timestamp = std::stoull(token);
        if (std::getline(ss, token)) msg.payload = token;

        return msg;
    }
};

class IPCMessageBus {
public:
    IPCMessageBus() : is_active_(true) {}

    void send_message(const IPCMessage& msg) {
        std::lock_guard<std::mutex> lock(queue_mutex_);
        message_queue_.push(msg);
        cv_.notify_one();
    }

    bool receive_message(IPCMessage& out_msg, uint32_t timeout_ms = 1000) {
        std::unique_lock<std::mutex> lock(queue_mutex_);
        if (cv_.wait_for(lock, std::chrono::milliseconds(timeout_ms), [this] {
            return !message_queue_.empty() || !is_active_;
        })) {
            if (!message_queue_.empty()) {
                out_msg = message_queue_.front();
                message_queue_.pop();
                return true;
            }
        }
        return false;
    }

    void shutdown() {
        {
            std::lock_guard<std::mutex> lock(queue_mutex_);
            is_active_ = false;
        }
        cv_.notify_all();
    }

    bool is_active() const {
        return is_active_;
    }

private:
    std::queue<IPCMessage> message_queue_;
    mutable std::mutex queue_mutex_;
    std::condition_variable cv_;
    bool is_active_;
};

} // namespace BlackEngine

#endif // IPC_MESSAGE_BUS_HPP
