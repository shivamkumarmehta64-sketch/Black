#include "shield_engine.hpp"
#include "shield_rules.hpp"

namespace BlackShield {

ShieldEngine::ShieldEngine() {
    ad_domains_.insert(AD_DOMAINS().begin(), AD_DOMAINS().end());
    tracker_domains_.insert(TRACKER_DOMAINS().begin(), TRACKER_DOMAINS().end());
    analytic_domains_.insert(ANALYTIC_DOMAINS().begin(), ANALYTIC_DOMAINS().end());
    social_domains_.insert(SOCIAL_DOMAINS().begin(), SOCIAL_DOMAINS().end());
    telemetry_domains_.insert(TELEMETRY_DOMAINS().begin(), TELEMETRY_DOMAINS().end());

    for (const auto& pr : PATTERN_RULES()) {
        P p;
        p.pattern = pr.pattern;
        to_lower_inplace(p.pattern);
        p.type = static_cast<ResourceType>(pr.resource_type);
        p.category = pr.category;
        patterns_.push_back(std::move(p));
    }

    total_rules_ = ad_domains_.size() + tracker_domains_.size() +
                   analytic_domains_.size() + social_domains_.size() +
                   telemetry_domains_.size() + patterns_.size();
}

ResourceType parse_resource_type(const std::string& t) {
    std::string s;
    for (char c : t) s += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    if (s == "script")            return ResourceType::Script;
    if (s == "image")             return ResourceType::Image;
    if (s == "stylesheet")        return ResourceType::Stylesheet;
    if (s == "font")              return ResourceType::Font;
    if (s == "media")             return ResourceType::Media;
    if (s == "xmlhttprequest")    return ResourceType::XmlHttpRequest;
    if (s == "xhr")               return ResourceType::XmlHttpRequest;
    if (s == "other")             return ResourceType::Other;
    return ResourceType::Any;
}

void ShieldEngine::to_lower_inplace(std::string& s) {
    for (char& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
}

std::string ShieldEngine::extract_domain(const std::string& url) {
    // Strip scheme
    std::string rest = url;
    std::size_t scheme = rest.find("://");
    if (scheme != std::string::npos) rest = rest.substr(scheme + 3);

    // Strip userinfo
    std::size_t at = rest.find('@');
    if (at != std::string::npos) rest = rest.substr(at + 1);

    // Strip port / path / query / fragment
    std::size_t end = rest.find_first_of("/?#");
    if (end != std::string::npos) rest = rest.substr(0, end);

    // Handle IPv6 bracket
    std::size_t lb = rest.find('[');
    std::size_t rb = rest.find(']');
    if (lb != std::string::npos && rb != std::string::npos) {
        return rest.substr(lb + 1, rb - lb - 1);
    }
    to_lower_inplace(rest);
    return rest;
}

bool ShieldEngine::match_domains(const std::string& domain,
                                 const std::unordered_set<std::string>& set,
                                 std::string& matched) const {
    if (domain.empty()) return false;
    // Walk up the dot hierarchy: a.b.example.com, b.example.com, example.com
    std::string suffix = domain;
    std::size_t pos = std::string::npos;
    while (true) {
        if (set.find(suffix) != set.end()) { matched = suffix; return true; }
        pos = suffix.find('.');
        if (pos == std::string::npos) break;
        suffix = suffix.substr(pos + 1);
    }
    return false;
}

bool ShieldEngine::should_block(const std::string& url, ResourceType type, MatchRule& out) const {
    const std::string domain = extract_domain(url);
    if (!domain.empty()) {
        if (match_domains(domain, ad_domains_, out.matched)) { out.category = "advertising"; return true; }
        if (match_domains(domain, tracker_domains_, out.matched)) { out.category = "tracking"; return true; }
        if (match_domains(domain, analytic_domains_, out.matched)) { out.category = "analytics"; return true; }
        if (match_domains(domain, social_domains_, out.matched)) { out.category = "social"; return true; }
        if (match_domains(domain, telemetry_domains_, out.matched)) { out.category = "telemetry"; return true; }
    }

    std::string lower_url = url;
    to_lower_inplace(lower_url);

    for (const auto& p : patterns_) {
        if (p.type != ResourceType::Any && p.type != type) continue;
        if (lower_url.find(p.pattern) != std::string::npos) {
            out.matched = p.pattern;
            out.category = p.category;
            out.pattern_match = true;
            return true;
        }
    }
    return false;
}

} // namespace BlackShield
