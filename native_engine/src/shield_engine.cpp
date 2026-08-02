#include "../include/shield_engine.hpp"
#include "../include/shield_rules.hpp"

#include <fstream>
#include <sstream>
#include <algorithm>
#include <cctype>

namespace BlackShield {

static bool ieq(const std::string& a, const std::string& b) {
    if (a.size() != b.size()) return false;
    for (size_t i = 0; i < a.size(); ++i) {
        if (std::tolower((unsigned char)a[i]) != std::tolower((unsigned char)b[i])) return false;
    }
    return true;
}

ResourceType parse_resource_type(const std::string& t) {
    if (ieq(t, "script"))          return ResourceType::Script;
    if (ieq(t, "image"))           return ResourceType::Image;
    if (ieq(t, "stylesheet"))      return ResourceType::Stylesheet;
    if (ieq(t, "font"))            return ResourceType::Font;
    if (ieq(t, "media"))           return ResourceType::Media;
    if (ieq(t, "xmlhttprequest"))  return ResourceType::XmlHttpRequest;
    if (ieq(t, "xhr"))             return ResourceType::XmlHttpRequest;
    if (ieq(t, "other"))           return ResourceType::Other;
    return ResourceType::Any;
}

uint32_t resource_type_bits(ResourceType t) {
    switch (t) {
        case ResourceType::Script:         return T_SCRIPT;
        case ResourceType::Image:          return T_IMAGE;
        case ResourceType::Stylesheet:     return T_STYLESHEET;
        case ResourceType::Font:           return T_FONT;
        case ResourceType::Media:          return T_MEDIA;
        case ResourceType::XmlHttpRequest: return T_XHR;
        case ResourceType::Other:          return T_OTHER;
        default:                           return T_ANY;
    }
}

ShieldEngine::ShieldEngine() {}

void ShieldEngine::to_lower(std::string& s) {
    for (char& c : s) c = static_cast<char>(std::tolower((unsigned char)c));
}

std::string ShieldEngine::extract_host(const std::string& url) {
    std::string rest = url;
    size_t scheme = rest.find("://");
    if (scheme != std::string::npos) rest = rest.substr(scheme + 3);
    size_t at = rest.find('@');
    if (at != std::string::npos) rest = rest.substr(at + 1);
    size_t end = rest.find_first_of("/?#");
    if (end != std::string::npos) rest = rest.substr(0, end);
    size_t lb = rest.find('['), rb = rest.find(']');
    if (lb != std::string::npos && rb != std::string::npos) rest = rest.substr(lb + 1, rb - lb - 1);
    to_lower(rest);
    return rest;
}

bool ShieldEngine::site_matches(const std::string& site, const std::string& rule_domain) {
    if (rule_domain.empty() || rule_domain == "*") return true;
    if (site == rule_domain) return true;
    return site.size() > rule_domain.size() &&
           site.compare(site.size() - rule_domain.size() - 1, rule_domain.size() + 1, "." + rule_domain) == 0;
}

static bool is_separator_char(char c) {
    if (c == '\0') return true;
    return !(std::isalnum((unsigned char)c) || c == '_' || c == '-' || c == '.' || c == '%');
}

// Match a single segment (may contain `*`) against text starting at `from`.
// Returns true and sets end when found at or after `from`.
static bool wildcard_find(const std::string& text, const std::string& seg,
                          size_t from, size_t& out_end) {
    size_t pi = 0, ti = from;
    while (pi < seg.size()) {
        if (seg[pi] == '*') {
            if (pi + 1 == seg.size()) { out_end = text.size(); return true; }
            size_t np = pi + 1;
            std::string lit;
            while (np < seg.size() && seg[np] != '*') lit += seg[np++];
            size_t idx = text.find(lit, ti);
            if (idx == std::string::npos) return false;
            ti = idx + lit.size();
            pi = np;
            continue;
        }
        if (ti >= text.size() || text[ti] != seg[pi]) return false;
        ++ti; ++pi;
    }
    out_end = ti;
    return true;
}

bool ShieldEngine::pattern_match(const std::string& text, const std::string& pattern,
                                 bool domain_anchor, bool anchor_start, bool anchor_end,
                                 std::string& matched) {
    std::string p = pattern;
    std::string t = text;
    to_lower(p);
    to_lower(t);

    // Split on `^` separators
    std::vector<std::string> segs;
    std::string cur;
    for (size_t i = 0; i < p.size(); ++i) {
        if (p[i] == '^') { segs.push_back(cur); cur.clear(); }
        else cur += p[i];
    }
    bool trailing_caret = !p.empty() && p.back() == '^';
    segs.push_back(cur);
    while (!segs.empty() && segs.front().empty()) segs.erase(segs.begin());
    while (!segs.empty() && segs.back().empty()) segs.pop_back();
    if (segs.empty()) return false;

    // First candidate start must be at a position where segs[0] can begin:
    // every occurrence of the first literal character of segs[0].
    const std::string& s0 = segs[0];
    size_t lit = 0;
    while (lit < s0.size() && s0[lit] == '*') ++lit;
    if (lit >= s0.size()) {
        // all wildcards — matches anywhere
        matched = pattern;
        return true;
    }
    const char firstc = s0[lit];
    size_t start = 0;
    while (true) {
        size_t at = t.find(firstc, start);
        if (at == std::string::npos) break;
        size_t seg0_start = at - lit;  // allow leading '*' chars before
        // boundary conditions
        if (domain_anchor) {
            bool host_start = (seg0_start == 0);
            if (!host_start && seg0_start >= 3 &&
                (t.compare(seg0_start - 3, 3, "://") == 0)) host_start = true;
            if (!host_start) { start = at + 1; continue; }
        }
        if (anchor_start && seg0_start != 0) { start = at + 1; continue; }

        // match all segments from seg0_start
        size_t pos = seg0_start;
        bool ok = true;
        for (size_t i = 0; i < segs.size(); ++i) {
            size_t end = 0;
            if (!wildcard_find(t, segs[i], pos, end)) { ok = false; break; }
            pos = end;
            bool need_sep = (i + 1 < segs.size()) || trailing_caret;
            if (need_sep) {
                if (pos >= t.size()) {
                    // separator at end-of-string counts
                } else if (!is_separator_char(t[pos])) {
                    ok = false; break;
                } else {
                    ++pos;
                }
            }
        }
        if (ok) {
            if (anchor_end && pos != t.size()) ok = false;
            if (ok) { matched = pattern; return true; }
        }
        start = at + 1;
    }
    return false;
}

bool ShieldEngine::net_rule_hits(const NetRule& r, const std::string& lower_url,
                                 const std::string& host, ResourceType type,
                                 const std::string& site, std::string& matched) const {
    if (r.types != T_ANY) {
        const uint32_t bits = resource_type_bits(type);
        if ((r.types & bits) == 0) return false;
    }
    if (!r.domains.empty() || !r.not_domains.empty()) {
        bool dm = r.domains.empty();
        for (const auto& d : r.domains) if (site_matches(site, d)) { dm = true; break; }
        if (!dm) return false;
        for (const auto& d : r.not_domains) if (site_matches(site, d)) return false;
    }
    if (r.third_party || r.first_party) {
        bool tp = true;
        if (!site.empty() && !host.empty()) tp = !site_matches(site, host);
        if (r.third_party && !tp) return false;
        if (r.first_party && tp) return false;
    }
    if (r.domain_anchor) {
        std::string domain = r.pattern.substr(0, r.pattern.find_first_of("/?*^"));
        if (!site_matches(host, domain)) return false;
    }
    return pattern_match(lower_url, r.pattern, r.domain_anchor, r.url_anchor_start, r.url_anchor_end, matched);
}

static std::vector<std::string> split(const std::string& s, char sep) {
    std::vector<std::string> out;
    std::string cur;
    for (char c : s) {
        if (c == sep) { if (!cur.empty()) out.push_back(cur); cur.clear(); }
        else cur += c;
    }
    if (!cur.empty()) out.push_back(cur);
    return out;
}

bool ShieldEngine::should_block(const std::string& url, ResourceType type,
                                const std::string& site, MatchRule& out) const {
    std::string lower_url = url;
    to_lower(lower_url);
    const std::string host = extract_host(url);
    std::string matched;

    for (const auto& r : important_rules_) {
        if (net_rule_hits(r, lower_url, host, type, site, matched)) {
            out.category = r.category;
            out.matched = matched;
            out.pattern_match = true;
            return true;
        }
    }
    for (const auto& r : exception_rules_) {
        if (net_rule_hits(r, lower_url, host, type, site, matched)) return false;
    }
    auto bucket = domain_index_.find(host);
    if (bucket == domain_index_.end()) {
        std::string h = host;
        size_t dot = 0;
        while ((dot = h.find('.')) != std::string::npos) {
            h = h.substr(dot + 1);
            bucket = domain_index_.find(h);
            if (bucket != domain_index_.end()) break;
        }
    }
    if (bucket != domain_index_.end()) {
        for (size_t id : bucket->second) {
            const auto& r = network_rules_[id];
            if (net_rule_hits(r, lower_url, host, type, site, matched)) {
                out.category = r.category;
                out.matched = matched;
                out.pattern_match = true;
                return true;
            }
        }
    }
    for (size_t id : generic_rule_ids_) {
        const auto& r = network_rules_[id];
        if (net_rule_hits(r, lower_url, host, type, site, matched)) {
            out.category = r.category;
            out.matched = matched;
            out.pattern_match = true;
            return true;
        }
    }
    return false;
}

std::vector<std::string> ShieldEngine::cosmetic_for(const std::string& site) const {
    std::vector<std::string> out;
    std::unordered_set<std::string> except;
    for (const auto& r : generic_cosmetic_rules_) {
        if (r.is_exception) except.insert(r.selector);
        else out.push_back(r.selector);
    }
    for (const auto& r : cosmetic_rules_) {
        if (!site_matches(site, r.site)) continue;
        if (r.is_exception) except.insert(r.selector);
        else out.push_back(r.selector);
    }
    std::vector<std::string> filtered;
    filtered.reserve(out.size());
    for (const auto& s : out) {
        if (except.find(s) == except.end()) filtered.push_back(s);
    }
    return filtered;
}

void ShieldEngine::load_builtin() {
    auto add_domain_rules = [this](const std::vector<std::string>& list, const std::string& cat) {
        for (const auto& d : list) {
            NetRule r;
            r.text = "||" + d + "^";
            r.pattern = "||" + d + "^";
            r.domain_anchor = true;
            r.category = cat;
            r.types = T_ANY;
            network_rules_.push_back(r);
            domain_index_[d].push_back(network_rules_.size() - 1);
        }
    };
    add_domain_rules(AD_DOMAINS(), "advertising");
    add_domain_rules(TRACKER_DOMAINS(), "tracking");
    add_domain_rules(ANALYTIC_DOMAINS(), "analytics");
    add_domain_rules(SOCIAL_DOMAINS(), "social");
    add_domain_rules(TELEMETRY_DOMAINS(), "telemetry");

    for (const auto& pr : PATTERN_RULES()) {
        NetRule r;
        r.text = pr.pattern;
        r.pattern = pr.pattern;
        r.category = pr.category;
        if (pr.resource_type == 7) r.types = T_ANY;
        else if (pr.resource_type == 6) r.types = T_OTHER;
        else if (pr.resource_type >= 0 && pr.resource_type <= 5)
            r.types = (1u << static_cast<uint32_t>(pr.resource_type));
        else r.types = T_ANY;
        network_rules_.push_back(r);
        generic_rule_ids_.push_back(network_rules_.size() - 1);
    }
}

static bool parse_options(const std::string& opts, NetRule& r) {
    for (const auto& o : split(opts, ',')) {
        std::string oo = o;
        std::transform(oo.begin(), oo.end(), oo.begin(),
                       [](unsigned char c){ return std::tolower(c); });
        if (oo == "script") r.types |= T_SCRIPT;
        else if (oo == "image") r.types |= T_IMAGE;
        else if (oo == "stylesheet" || oo == "css") r.types |= T_STYLESHEET;
        else if (oo == "font") r.types |= T_FONT;
        else if (oo == "media" || oo == "video") r.types |= T_MEDIA;
        else if (oo == "xmlhttprequest" || oo == "xhr") r.types |= T_XHR;
        else if (oo == "subdocument" || oo == "frame") r.types |= T_SUBDOC;
        else if (oo == "websocket") r.types |= T_WEBSOCKET;
        else if (oo == "ping") r.types |= T_PING;
        else if (oo == "other") r.types |= T_OTHER;
        else if (oo == "third-party") r.third_party = true;
        else if (oo == "first-party") r.first_party = true;
        else if (oo == "important") r.important = true;
        else if (oo == "match-case") return false;
        else if (oo == "generichide" || oo == "elemhide" || oo == "specifichide" ||
                 oo == "document" || oo == "popup" || oo == "popunder" ||
                 oo == "object" || oo == "object-subrequest" || oo == "dtd" ||
                 oo == "domain" ) return false;
        else if (oo.rfind("domain=", 0) == 0) {
            for (const auto& d : split(oo.substr(7), '|')) {
                if (!d.empty() && d[0] == '~') r.not_domains.push_back(d.substr(1));
                else r.domains.push_back(d);
            }
        }
        else if (oo.rfind("redirect", 0) == 0 || oo.rfind("redirect-rule", 0) == 0) {
            // treat as a plain block
        }
        else if (oo.rfind("removeparam", 0) == 0 || oo.rfind("csp", 0) == 0 ||
                 oo.rfind("denyallow", 0) == 0 || oo.rfind("method", 0) == 0 ||
                 oo.rfind("to=", 0) == 0 || oo.rfind("from=", 0) == 0 ||
                 oo.rfind("tag=", 0) == 0 || oo.rfind("header", 0) == 0 ||
                 oo.rfind("redirect-name", 0) == 0) return false;
        else return false;  // unknown option -> drop rule (ABP semantics)
    }
    return true;
}

size_t ShieldEngine::load_list_file(const std::string& path, const std::string& category) {
    std::ifstream in(path);
    if (!in) return 0;
    size_t added = 0;
    std::string line;
    while (std::getline(in, line)) {
        if (line.empty()) continue;
        if (line[0] == '!' || line[0] == '[') continue;
        if (!line.empty() && line.back() == '\r') line.pop_back();
        if (line.empty()) continue;

        // ── cosmetic rules ──
        size_t cc = line.find("##");
        if (cc != std::string::npos) {
            bool exception = (line.find("#@#") != std::string::npos);
            std::string sites = line.substr(0, cc);
            std::string sel = line.substr(cc + 2);
            if (sel.empty() || sel.rfind("+js", 0) == 0) { ++skipped_; continue; }
            if (sel.find(":has") != std::string::npos ||
                sel.find(":xpath") != std::string::npos ||
                sel.find(":-abp") != std::string::npos ||
                sel.find(":matches") != std::string::npos ||
                sel.find(":upward") != std::string::npos ||
                sel.find("##") != std::string::npos) { ++skipped_; continue; }
            auto add_cosmetic = [this, &sel, exception, &added](const std::string& s) {
                CosmeticRule cr;
                cr.selector = sel;
                cr.site = s;
                cr.is_exception = exception;
                if (s.empty()) generic_cosmetic_rules_.push_back(cr);
                else cosmetic_rules_.push_back(cr);
                ++added;
            };
            if (sites.empty()) {
                add_cosmetic("");
            } else {
                for (const auto& s : split(sites, ',')) add_cosmetic(s);
            }
            continue;
        }

        // JS injection rules (#%# ...) — skip
        if (line.find("#%#") != std::string::npos) { ++skipped_; continue; }

        // ── network rules ──
        std::string rule = line;
        NetRule r;
        r.category = category.empty() ? "advertising" : category;

        size_t dollar = rule.rfind('$');
        if (dollar != std::string::npos) {
            if (!parse_options(rule.substr(dollar + 1), r)) { ++skipped_; continue; }
            rule = rule.substr(0, dollar);
            if (r.types == 0) r.types = T_ANY;
        }

        if (rule.size() >= 2 && rule[0] == '/' && rule.back() == '/') { ++skipped_; continue; }

        if (rule.rfind("@@", 0) == 0) {
            rule = rule.substr(2);
            r.is_exception = true;
        }
        if (rule.rfind("||", 0) == 0) {
            rule = rule.substr(2);
            r.domain_anchor = true;
        } else if (rule.rfind("|", 0) == 0) {
            rule = rule.substr(1);
            r.url_anchor_start = true;
        }
        if (!rule.empty() && rule.back() == '|') {
            rule.pop_back();
            r.url_anchor_end = true;
        }
        if (rule.empty()) { ++skipped_; continue; }

        r.text = line;
        r.pattern = rule;
        std::transform(r.pattern.begin(), r.pattern.end(), r.pattern.begin(),
                       [](unsigned char c){ return std::tolower(c); });

        if (r.is_exception) {
            exception_rules_.push_back(std::move(r));
        } else if (r.important) {
            important_rules_.push_back(std::move(r));
        } else if (r.domain_anchor) {
            std::string domain = r.pattern.substr(0, r.pattern.find_first_of("/?*^"));
            if (!domain.empty()) {
                network_rules_.push_back(std::move(r));
                domain_index_[domain].push_back(network_rules_.size() - 1);
            } else {
                generic_rule_ids_.push_back(network_rules_.size());
                network_rules_.push_back(std::move(r));
            }
        } else {
            generic_rule_ids_.push_back(network_rules_.size());
            network_rules_.push_back(std::move(r));
        }
        ++added;
    }
    return added;
}

} // namespace BlackShield
