#include "shield_rules.hpp"

namespace BlackShield {

static const std::vector<std::string> kAdDomains = {
    // Google ad network
    "doubleclick.net", "ad.doubleclick.net", "adclick.g.doubleclick.net",
    "static.doubleclick.net", "pubads.g.doubleclick.net", "googleads.g.doubleclick.net",
    "googleadservices.com", "googlesyndication.com", "pagead2.googlesyndication.com",
    "adservice.google.com", "ads.youtube.com", "adservice.google.com.tr",
    "g.doubleclick.net", "adwords.google.com", "www.googletagservices.com",
    "googletagservices.com", "adserving.unibet.com", "adservice.google.co.uk",
    // Ad exchanges & networks
    "adnxs.com", "adform.net", "adformdsp.net", "adsrvr.org", "advertising.com",
    "adzerk.net", "adsafeprotected.com", "moatads.com", "moatad.com", "sharethrough.com",
    "indexww.com", "pubmatic.com", "openx.net", "rubiconproject.com", "appnexus.com",
    "casalemedia.com", "contextweb.com", "onetag.com", "criteo.com", "criteo.net",
    "taboola.com", "outbrain.com", "zemanta.com", "adroll.com", "tribalfusion.com",
    "bluekai.com", "bidswitch.net", "bidr.io", "smartadserver.com", "smartadserver.fr",
    "smartadserver.it", "w55c.net", "agkn.com", "mookie1.com", "mathtag.com",
    "tapad.com", "turn.com", "media.net", "mgid.com", "revcontent.com", "popads.net",
    "propellerads.com", "exoclick.com", "adcash.com", "adsterra.com", "hilltopads.net",
    "onclickads.net", "juicyads.com", "trafficjunky.net", "adf.ly", "adcolony.com",
    "vungle.com", "unityads.unity3d.com", "applovin.com", "ironsrc.mobi",
    "inmobi.com", "chartboost.com", "admob.com", "flurry.com", "mopub.com",
    "supersonicads.com", "tapjoy.com", "mintegral.com", "ironsource.mobi",
    // Ad delivery & creative
    "adserver.com", "adsrvmedia.net", "adv-adserver.com", "adspirit.de",
    "adtech.de", "adtechus.com", "adtech.fr", "adtech.com", "atwola.com",
    "burstnet.com", "bravenet.com", "fastclick.net", "liverail.com",
    "zmxcdn.com", "exponential.com", "tribalfusion.com", "avocet.io",
    "mediavine.com", "adthrive.com", "ezoic.com", "sovrn.com", "lasso.link",
    // Rich media / video ads
    "mopub.com", "vidyard.com", "spotxchange.com", "spotx.tv", "innovid.com",
    "videologygroup.com", "tremorvideo.com", "yieldmo.com", "unrulymedia.com",
    "teads.tv", "adyoulike.com", "adup-tech.com", "smaato.net", "improvedigital.com",
    "siftmedia.com", "gumgum.com", "kiosked.com", "ligatus.com", "plista.com",
    // Ad measurement
    "mrcw.org", "doubleverify.com", "integralads.com", "adnxs-simple.com",
    "demdex.net", "krxd.net", "mathtag.com", "prosperent.com", "skimlinks.com",
    "avantlink.com", "cj.com", "linksynergy.com", "impactradius.com",
    "rakutenadvertising.com", "clickbank.net", "shareasale.com", "commissionjunction.com",
    "awin1.com", "zanox.com", "tradedoubler.com", "publift.com", "freestar.io",
    // Amazon & retail ads
    "amazon-adsystem.com", "aaxads.com", "aax-eu.amazon-adsystem.com",
    "images-na.ssl-images-amazon.com", "advertising.amazon.com",
    "alibaba.com/trade/search", "admitad.com", "admitad-projects.com"
};

static const std::vector<std::string> kTrackerDomains = {
    // Fingerprinting & trackers
    "fingerprintjs.com", "fpjs.io", "1dmp.io", "1rx.io", "3lift.com",
    "51.la", "adara.com", "adskeeper.co.uk", "advangelists.com", "advisible.com",
    "adzmetric.com", "affine.tv", "agkn.com", "amobee.com", "apxlv.com",
    "atdmt.com", "audienceinsights.net", "audiencescience.com", "beaconads.com",
    "betweendigital.com", "bidtheatre.com", "bkrtx.com", "bttrack.com",
    "carbonads.com", "chango.com", "cleveradvertising.com", "cootlog.com",
    "crwdcntrl.net", "dataxu.com", "dpm.demdex.net", "doubleverify.com",
    "dynadmic.com", "eplanning.net", "everestads.net", "everesttech.net",
    "exelator.com", "eyeota.net", "fiftyt.com", "flashbanner.nl",
    "flite.com", "fluct.jp", "fwmrm.net", "gammassp.mobi", "grapeshot.co.uk",
    "gwallet.com", "harrenmedia.com", "hottraffic.nl", "huluad.com",
    "ib-ibi.com", "imrworldwide.com", "innity.com", "ipredictive.com",
    "jsdelivr.net/pixel", "jwpltx.com", "kargo.com", "kenshoo.com",
    "lotame.com", "ltassrv.com", "luceadev.com", "magnetic.com", "metrigo.com",
    "millennialmedia.com", "mixmarket.net", "mktoresp.com", "mobials.com",
    "mondo.ai", "moatads.com", "mobfox.com", "msn.com/ads", "neodata.com",
    "nflxso.net", "nobid.io", "ojrq.net", "onm.de", "openweb.com",
    "optnmnstr.com", "orbengine.com", "pamedia.com", "picadmedia.com",
    "pixel.rubiconproject.com", "pmc1.com", "pmc2.com", "presage.io",
    "quantserve.com", "quantcast.com", "quimbycdn.com", "rhythmone.com",
    "rightmedia.com", "rlcdn.com", "rtbhouse.com", "scanalert.com",
    "seethru.co", "serving-sys.com", "seznam.cz", "simpli.fi", "sonobi.com",
    "spot.im", "stickyadstv.com", "storygize.net", "streamrail.com",
    "stumbleupon.com", "sundaysky.com", "tap.me", "targusad.com",
    "tbcdn.com", "tidaltv.com", "titanpixel.com", "trc.taboola.com",
    "treasuredata.com", "triplelift.com", "tumri.com", "unica.com",
    "upick.de", "viralize.com", "visualrevenue.com", "vue.ai",
    "weborama.fr", "weborama.com", "whitesmoke.us", "xplosion.de",
    "yaboadinfo.com", "yieldlab.net", "yieldmanager.com", "yieldnorth.com",
    "z5x.net", "zedo.com", "zergnet.com"
};

static const std::vector<std::string> kAnalyticDomains = {
    // Analytics SDKs
    "google-analytics.com", "analytics.google.com", "ssl.google-analytics.com",
    "stats.g.doubleclick.net", "googletagmanager.com", "gtmjs.com",
    "gtmstats.com", "tagmanager.google.com", "analytics.yahoo.com",
    "advertising.yahoo.com", "analytics.twitter.com", "ads.twitter.com",
    "static.ads-twitter.com", "analytics.edgekey.net", "segment.io",
    "segment.com", "cdn.segment.com", "api.segment.io", "amplitude.com",
    "cdn.amplitude.com", "api.amplitude.com", "mixpanel.com", "api.mixpanel.com",
    "cdp.mixpanel.com", "matomo.cloud", "piwik.org", "piwik.pro",
    "hotjar.com", "static.hotjar.com", "inspectlet.com", "luckyorange.com",
    "criteo.net", "clarity.ms", "clarity.ms/track", "newrelic.com",
    "js-agent.newrelic.com", "nr-data.net", "bam.nr-data.net", "datadoghq.com",
    "datadog.com", "app.datadoghq.com", "sentry.io", "o354189.ingest.sentry.io",
    "bugsnag.com", "notify.bugsnag.com", "fullstory.com", "rs.fullstory.com",
    "sessioncam.com", "crazyegg.com", "mouseflow.com", "smartlook.com",
    "clicktale.net", "clicktale.com", "dynatrace.com", "dynatrace.net",
    "logrocket.com", "l.getsitecontrol.com", "statsig.com", "posthog.com",
    "app.posthog.com", "heap.io", "heapanalytics.com", "kochava.com",
    "appsflyer.com", "appsflyer-sdk.com", "adjust.com", "branch.io",
    "branchmetrics.com", "flurry.com", "countly.com", "tealium.com",
    "tealiumiq.com", "tags.tiqcdn.com", "ensighten.com", "adobeanalytics.com",
    "adobedtm.com", "sc.omtrdc.net", "omniture.com", "2o7.net",
    "scorecardresearch.com", "quantcount.com", "quantserve.com", "chartbeat.com",
    "chartbeat.net", "ping.chartbeat.net", "parsely.com", "parsely-tracker.com",
    "comscore.com", "mxpnl.com", "webtrends.com", "webtrendslive.com",
    "squarespace.com/analytics", "cloudflare.com/cdn-cgi/rum", "umami.is",
    "analyticsumami.com", "plausible.io", "goatcounter.com", "counter.dev",
    "koalendar.com", "simpleanalytics.com", "fathomhq.com", "fathomanalytics.com"
};

static const std::vector<std::string> kSocialDomains = {
    "connect.facebook.net", "facebook.com/tr", "fbcdn.net", "graph.facebook.com",
    "pixel.facebook.com", "staticxx.facebook.com", "platform.twitter.com",
    "twitter.com/i/jot", "ads.tiktok.com", "analytics.tiktok.com",
    "analytics.pinterest.com", "ct.pinterest.com", "tr.instagram.com",
    "platform.instagram.com", "linkedin.com/analytics", "ads.linkedin.com",
    "analytics.linkedin.com", "snap.licdn.com", "sc-static.net",
    "analytics.snapchat.com", "tr.snapchat.com", "app-measurement.com",
    "ads.google.com/ads/measurement", "www.googleadservices.com/pagead/conversion",
    "ssl.google-analytics.com/gtm", "pixel.reddit.com", "ads.reddit.com",
    "sb.scorecardresearch.com", "dtscdn.com", "quora.com/ads",
    "static.quora.com/ads", "cdn.embedly.com", "pixel.quantserve.com"
};

static const std::vector<std::string> kTelemetryDomains = {
    "vortex.data.microsoft.com", "watson.telemetry.microsoft.com",
    "telemetry.microsoft.com", "settings-win.data.microsoft.com",
    "v10.events.data.microsoft.com", "v20.events.data.microsoft.com",
    "browser.events.data.microsoft.com", "ca.telemetry.microsoft.com",
    "sqm.telemetry.microsoft.com", "vortex-win.data.microsoft.com",
    "geo.prod.do.dsp.mp.microsoft.com", "prod.do.dsp.mp.microsoft.com",
    "cs.dds.microsoft.com", "browser.pipe.aria.microsoft.com",
    "vancouver.ping.azureedge.net", "dpm.demdex.net", "google.com/pagead/landing",
    "www.google.com/gen_204", "stats.g.doubleclick.net/j/collect",
    "csi.gstatic.com", "metrics.google.com", "ssl.google-analytics.com/g/collect",
    "firebaseinstallations.googleapis.com", "app-measurement.com",
    "play.google.com/log", "g.msn.com", "ads.msn.com", "cdx.cedexis.com",
    "cedexis-radar.net", "ocsp.godaddy.com", "connectivitycheck.gstatic.com",
    "clients3.google.com/generate_204", "www.google.com/url?sa=t",
    "api.numerama.com", "blocklist.zscaler.com", "dns-verifier.cloudflare.com",
    "update.googleapis.com", "clients1.google.com", "clients2.google.com",
    "clients4.google.com", "safebrowsing.googleapis.com",
    "safebrowsing.clients.google.com", "safebrowsing.google.com"
};

static const std::vector<PatternRule> kPatterns = {
    { "pagead", 0, "advertising" },
    { "pagead2", 0, "advertising" },
    { "/ads?", 6, "advertising" },
    { "adserver", 6, "advertising" },
    { "/banner_", 1, "advertising" },
    { "adservice", 0, "advertising" },
    { "doubleclick", 0, "advertising" },
    { "googlesyndication", 0, "advertising" },
    { "googleadservices", 0, "advertising" },
    { "/analytics/", 0, "analytics" },
    { "google-analytics", 0, "analytics" },
    { "googletagmanager", 0, "analytics" },
    { "gtag/js", 0, "analytics" },
    { "/beacon", 7, "tracking" },
    { "/pixel?", 7, "tracking" },
    { "quantcount", 0, "analytics" },
    { "scorecardresearch", 0, "analytics" },
    { "amazon-adsystem", 0, "advertising" },
    { "youtube.com/api/stats", 0, "tracking" },
    { "youtube.com/ptracking", 0, "tracking" },
    { "youtube.com/pagead", 0, "advertising" },
    { "youtube.com/get_midroll_info", 5, "advertising" },
    { "youtube.com/youtubei/v1/AdTrailer", 5, "advertising" },
    { "facebook.com/tr", 0, "social" },
    { "connect.facebook.net", 0, "social" },
    { "mc.yandex", 0, "analytics" },
    { "yandex.ru/metrika", 0, "analytics" },
    { "/collect?", 0, "tracking" },
    { "/telemetry", 5, "telemetry" },
    { "/metrics", 6, "telemetry" },
    { "adnxs.com", 0, "advertising" },
    { "adsrvr.org", 0, "advertising" },
    { "criteo", 0, "advertising" },
    { "taboola", 0, "advertising" },
    { "outbrain", 0, "advertising" },
    { "amazon-adsystem.com", 0, "advertising" },
    { "adsystem", 0, "advertising" },
    { "adclick", 0, "advertising" },
    { "/sponsor/", 6, "advertising" },
    { "/sponsored", 6, "advertising" },
    { "tracking.rdstation", 6, "tracking" }
};

const std::vector<std::string>& AD_DOMAINS() { return kAdDomains; }
const std::vector<std::string>& TRACKER_DOMAINS() { return kTrackerDomains; }
const std::vector<std::string>& ANALYTIC_DOMAINS() { return kAnalyticDomains; }
const std::vector<std::string>& SOCIAL_DOMAINS() { return kSocialDomains; }
const std::vector<std::string>& TELEMETRY_DOMAINS() { return kTelemetryDomains; }
const std::vector<PatternRule>& PATTERN_RULES() { return kPatterns; }

} // namespace BlackShield
