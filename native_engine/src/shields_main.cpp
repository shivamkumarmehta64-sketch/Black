// Black Browser Shields — native ad/tracker blocking engine (Brave/ABP-style).
//
// Line protocol over stdin/stdout (tab-separated):
//   CHECK  <resource_type>  <url>  [site]
//     -> BLOCK <category> <matched_rule>   (block the request)
//     -> PASS  -  -
//   COSMETIC <id> <site>
//     -> COSM <id> <count> <selector>...
//   LIST <category> <path>            (load an EasyList-format file)
//     -> LISTED <count> <cosmetic>
//   PING   -> PONG
//   STATS  -> STATS <rules> <cosmetic> <checks> <blocks>
//   EXIT   -> (process terminates)
//
// resource_type: script | image | stylesheet | font | media |
//                xmlhttprequest | other

#include "../include/shield_engine.hpp"

#include <iostream>
#include <sstream>
#include <string>

int main() {
    BlackShield::ShieldEngine engine;
    engine.load_builtin();

    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    unsigned long long checks = 0;
    unsigned long long blocks = 0;

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;

        std::istringstream ss(line);
        std::string cmd, arg1, arg2, arg3;
        std::getline(ss, cmd, '\t');
        std::getline(ss, arg1, '\t');
        std::getline(ss, arg2, '\t');
        std::getline(ss, arg3);

        if (cmd == "CHECK") {
            checks++;
            BlackShield::ResourceType type = BlackShield::parse_resource_type(arg1);
            BlackShield::MatchRule match;
            if (engine.should_block(arg2, type, arg3, match)) {
                blocks++;
                std::cout << "BLOCK\t" << match.category << "\t" << match.matched << "\n";
            } else {
                std::cout << "PASS\t-\t-\n";
            }
            std::cout.flush();
        } else if (cmd == "COSMETIC") {
            std::vector<std::string> sels = engine.cosmetic_for(arg2);
            std::cout << "COSM\t" << arg1 << "\t" << sels.size();
            for (const auto& s : sels) {
                std::cout << "\t" << s;
            }
            std::cout << "\n";
            std::cout.flush();
        } else if (cmd == "LIST") {
            size_t added = engine.load_list_file(arg2, arg1);
            std::cout << "LISTED\t" << added << "\t" << engine.cosmetic_count() << "\n";
            std::cout.flush();
        } else if (cmd == "PING") {
            std::cout << "PONG\n";
            std::cout.flush();
        } else if (cmd == "STATS") {
            std::cout << "STATS\t" << engine.rule_count() << "\t" << engine.cosmetic_count()
                      << "\t" << checks << "\t" << blocks << "\n";
            std::cout.flush();
        } else if (cmd == "EXIT") {
            std::cout << "BYE\n";
            std::cout.flush();
            break;
        }
    }
    return 0;
}
