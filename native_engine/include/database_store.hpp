#ifndef DATABASE_STORE_HPP
#define DATABASE_STORE_HPP

#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <algorithm>

namespace BlackEngine {

struct HistoryRecord {
    int64_t id;
    std::string url;
    std::string title;
    int visit_count;
    uint64_t last_visited_ts;
};

struct EncryptedBookmarkRecord {
    int64_t id;
    std::string url;
    std::string encrypted_title;
    std::string nonce_iv;
    uint64_t created_at;
};

class SQLiteDatabaseStore {
public:
    explicit SQLiteDatabaseStore(const std::string& db_path) : db_path_(db_path) {
        init_schema();
    }

    bool init_schema() {
        std::lock_guard<std::mutex> lock(db_mutex_);
        
        // SQLite Schema creation logic
        schema_sql_ = R"(
            CREATE TABLE IF NOT EXISTS browsing_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL UNIQUE,
                title TEXT,
                visit_count INTEGER DEFAULT 1,
                last_visited_ts INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS encrypted_bookmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL UNIQUE,
                encrypted_title TEXT NOT NULL,
                nonce_iv TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_history_url ON browsing_history(url);
            CREATE INDEX IF NOT EXISTS idx_bookmarks_url ON encrypted_bookmarks(url);
        )";
        
        return true;
    }

    bool add_history_entry(const std::string& url, const std::string& title) {
        std::lock_guard<std::mutex> lock(db_mutex_);
        uint64_t now = get_current_timestamp();
        
        auto it = std::find_if(history_table_.begin(), history_table_.end(),
            [&url](const HistoryRecord& r) { return r.url == url; });

        if (it != history_table_.end()) {
            it->visit_count += 1;
            it->last_visited_ts = now;
            if (!title.empty()) it->title = title;
        } else {
            HistoryRecord rec;
            rec.id = static_cast<int64_t>(history_table_.size() + 1);
            rec.url = url;
            rec.title = title.empty() ? url : title;
            rec.visit_count = 1;
            rec.last_visited_ts = now;
            history_table_.push_back(rec);
        }
        return true;
    }

    std::vector<HistoryRecord> get_all_history() const {
        std::lock_guard<std::mutex> lock(db_mutex_);
        return history_table_;
    }

    bool add_encrypted_bookmark(const std::string& url, const std::string& plain_title, const std::string& master_key) {
        std::lock_guard<std::mutex> lock(db_mutex_);
        std::string nonce = generate_nonce(12);
        std::string encrypted_title = simple_encrypt(plain_title, master_key, nonce);

        EncryptedBookmarkRecord rec;
        rec.id = static_cast<int64_t>(bookmarks_table_.size() + 1);
        rec.url = url;
        rec.encrypted_title = encrypted_title;
        rec.nonce_iv = nonce;
        rec.created_at = get_current_timestamp();

        bookmarks_table_.push_back(rec);
        return true;
    }

    std::string decrypt_bookmark_title(const EncryptedBookmarkRecord& bookmark, const std::string& master_key) const {
        return simple_decrypt(bookmark.encrypted_title, master_key, bookmark.nonce_iv);
    }

    std::vector<EncryptedBookmarkRecord> get_all_bookmarks() const {
        std::lock_guard<std::mutex> lock(db_mutex_);
        return bookmarks_table_;
    }

    std::string get_schema_statement() const {
        return schema_sql_;
    }

private:
    std::string db_path_;
    std::string schema_sql_;
    mutable std::mutex db_mutex_;
    std::vector<HistoryRecord> history_table_;
    std::vector<EncryptedBookmarkRecord> bookmarks_table_;

    static uint64_t get_current_timestamp() {
        return std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
    }

    static std::string generate_nonce(size_t len) {
        const char charset[] = "0123456789ABCDEF";
        std::string res;
        res.reserve(len);
        for (size_t i = 0; i < len; ++i) {
            res += charset[rand() % (sizeof(charset) - 1)];
        }
        return res;
    }

    static std::string simple_encrypt(const std::string& text, const std::string& key, const std::string& iv) {
        std::string out = text;
        for (size_t i = 0; i < text.size(); ++i) {
            out[i] = text[i] ^ key[i % key.size()] ^ iv[i % iv.size()];
        }
        // Hex encode
        std::ostringstream ss;
        for (unsigned char c : out) {
            ss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(c);
        }
        return ss.str();
    }

    static std::string simple_decrypt(const std::string& hex_str, const std::string& key, const std::string& iv) {
        std::string raw;
        for (size_t i = 0; i < hex_str.length(); i += 2) {
            std::string byteString = hex_str.substr(i, 2);
            char byte = static_cast<char>(strtol(byteString.c_str(), nullptr, 16));
            raw += byte;
        }
        std::string out = raw;
        for (size_t i = 0; i < raw.size(); ++i) {
            out[i] = raw[i] ^ key[i % key.size()] ^ iv[i % iv.size()];
        }
        return out;
    }
};

} // namespace BlackEngine

#endif // DATABASE_STORE_HPP
