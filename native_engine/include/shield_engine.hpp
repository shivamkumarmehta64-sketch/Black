#ifndef SHIELD_ENGINE_HPP
#define SHIELD_ENGINE_HPP

#include <string>
#include <vector>
#include <unordered_set>
#include <cctype>

namespace BlackShield {

enum class ResourceType {
    Script = 0, Image = 1, Stylesheet = 2, Font = 3, Media = 4,
    XmlHttpRequest = 5, Other = 6, Any = 7
};

ResourceType parse_resource_type(const std::string& t);

struct MatchRule {
    std::string category; // advertising | tracking | analytics | social | telemetry
    std::string matched;  // domain or pattern that matched
    bool pattern_match = false;
};

class ShieldEngine {
public:
    ShieldEngine();
    bool should_block(const std::string& url, ResourceType type, MatchRule& out) const;
    std::size_t rule_count() const { return total_rules_; }

private:
    std::unordered_set<std::string> ad_domains_;
    std::unordered_set<std::string> tracker_domains_;
    std::unordered_set<std::string> analytic_domains_;
    std::unordered_set<std::string> social_domains_;
    std::unordered_set<std::string> telemetry_domains_;

    struct P { std::string pattern; ResourceType type; std::string category; };
    std::vector<P> patterns_;

    std::size_t total_rules_ = 0;

    static std::string extract_domain(const std::string& url);
    static void to_lower_inplace(std::string& s);
    bool match_domains(const std::string& domain,
                       const std::unordered_set<std::string>& set,
                       std::string& matched) const;
};

} // namespace BlackShield

#endif // SHIELD_ENGINE_HPP
