#ifndef SHIELD_RULES_HPP
#define SHIELD_RULES_HPP

// Black Browser Shields — embedded public blocklist rules.
// Curated from well-known public ad/tracker lists (pgl.yoyo.org, EasyList
// style domain sets, disconnect lists). Categories:
//   ADVERTISING  — ad networks & exchanges
//   TRACKING     — trackers, beacons, fingerprinting infrastructure
//   ANALYTICS    — analytics SDKs & telemetry
//   SOCIAL       — social widgets & pixel tracking
//   TELEMETRY    — browser/OS telemetry endpoints

#include <string>
#include <vector>

namespace BlackShield {

const std::vector<std::string>& AD_DOMAINS();
const std::vector<std::string>& TRACKER_DOMAINS();
const std::vector<std::string>& ANALYTIC_DOMAINS();
const std::vector<std::string>& SOCIAL_DOMAINS();
const std::vector<std::string>& TELEMETRY_DOMAINS();

struct PatternRule {
    std::string pattern;
    int resource_type; // 0=script,1=image,2=stylesheet,3=font,4=media,5=xhr,6=other,7=any
    std::string category;
};

const std::vector<PatternRule>& PATTERN_RULES();

} // namespace BlackShield

#endif // SHIELD_RULES_HPP
