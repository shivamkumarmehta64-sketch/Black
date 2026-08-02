#ifndef SHIELD_ENGINE_HPP
#define SHIELD_ENGINE_HPP

// Black Browser Shields — native ad/tracker blocking engine (C++).
// EasyList/EasyPrivacy-compatible: network rules (||, /, *, ^, $options,
// @@ exceptions, $important) + cosmetic rules (site##selector).

#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <cstdint>
#include <functional>

namespace BlackShield {

// Resource type bits (ABP $type options)
enum TypeBits : uint32_t {
    T_SCRIPT      = 1u << 0,
    T_IMAGE       = 1u << 1,
    T_STYLESHEET  = 1u << 2,
    T_FONT        = 1u << 3,
    T_MEDIA       = 1u << 4,
    T_XHR         = 1u << 5,
    T_SUBDOC      = 1u << 6,
    T_WEBSOCKET   = 1u << 7,
    T_OTHER       = 1u << 8,
    T_PING        = 1u << 9,
    T_ANY         = 0xFFFFFFFFu
};

struct NetRule {
    std::string text;              // original rule text (for reporting)
    std::string pattern;           // lowercase pattern, `*` = wildcard
    bool domain_anchor = false;    // || prefix
    bool url_anchor_start = false; // | prefix
    bool url_anchor_end = false;   // trailing |
    uint32_t types = T_ANY;        // allowed resource types (0 after parse = invalid)
    std::vector<std::string> domains;    // $domain= allow-list (empty = any)
    std::vector<std::string> not_domains; // $domain=~x
    bool third_party = false;
    bool first_party = false;
    bool important = false;
    bool is_exception = false;
    std::string category;
    bool valid = true;
};

struct CosmeticRule {
    std::string site;      // specific site (no leading dot) or empty for generic
    std::string selector;
    bool is_exception = false;
};

enum class ResourceType { Script = 0, Image = 1, Stylesheet = 2, Font = 3, Media = 4,
                          XmlHttpRequest = 5, Other = 6, Any = 7 };

ResourceType parse_resource_type(const std::string& t);
uint32_t resource_type_bits(ResourceType t);

struct MatchRule {
    std::string category;
    std::string matched;
    bool pattern_match = false;
};

class ShieldEngine {
public:
    ShieldEngine();

    void load_builtin();
    // Parse an EasyList-format file into network + cosmetic rules.
    // category is used for rules that carry no explicit category (e.g. "advertising").
    size_t load_list_file(const std::string& path, const std::string& category);
    size_t rule_count() const { return network_rules_.size(); }
    size_t cosmetic_count() const { return cosmetic_rules_.size() + generic_cosmetic_rules_.size(); }
    size_t skipped_count() const { return skipped_; }

    bool should_block(const std::string& url, ResourceType type,
                      const std::string& site, MatchRule& out) const;

    // Collect cosmetic selectors for a site (specific + generic, minus exceptions).
    std::vector<std::string> cosmetic_for(const std::string& site) const;

private:
    std::vector<NetRule> network_rules_;
    std::vector<NetRule> important_rules_;
    std::vector<NetRule> exception_rules_;

    std::vector<CosmeticRule> cosmetic_rules_;          // site-specific
    std::vector<CosmeticRule> generic_cosmetic_rules_;  // generic (no site)
    size_t skipped_ = 0;

    // Index: domain-anchored rules bucketed by the first domain label,
    // so a request only scans the bucket of its own top-level domain + generic bucket.
    std::unordered_map<std::string, std::vector<size_t>> domain_index_;
    std::vector<size_t> generic_rule_ids_; // non domain-anchored rules

    static std::string extract_host(const std::string& url);
    static void to_lower(std::string& s);
    static bool site_matches(const std::string& site, const std::string& rule_domain);
    static bool pattern_match(const std::string& text, const std::string& pattern,
                              bool domain_anchor, bool anchor_start, bool anchor_end,
                              std::string& matched);
    bool net_rule_hits(const NetRule& r, const std::string& lower_url,
                       const std::string& host, ResourceType type,
                       const std::string& site, std::string& matched) const;
};

} // namespace BlackShield

#endif // SHIELD_ENGINE_HPP
