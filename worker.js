// ── v6.0 registry binding (Step 1, additive — see prompts.js / schedule.js) ──
import { AGENTS, CHANNELS, PIPELINE_ORDER, VOICE_DEFAULTS } from "./prompts.js";
import { resolvePublishAt, cronFireTimeFor, dueSlots } from "./schedule.js";

/**
 * Universe AI — Cloudflare Worker
 * ─────────────────────────────────────────────────────
 * Handles:
 *   POST /agent        — call any of 28 agents via Claude API
 *   POST /pipeline     — run full pipeline (short + long form)
 *   GET  /health       — system health check
 *   GET  /prompts      — return all agent prompts (for debugging)
 *   PUT  /prompts/:id  — update a single agent prompt (no GitHub needed)
 *
 * Environment Variables (set in Cloudflare Dashboard):
 *   CLAUDE_API_KEY   — Anthropic API key
 *   TG_TOKEN         — Telegram bot token (optional)
 *   TG_CHAT          — Telegram chat ID (optional)
 *
 * CORS: allows claude.ai and github.io origins
 */

// ─────────────────────────────────────────────────────
// AGENT PROMPTS — edit here OR via PUT /prompts/:id
// No GitHub upload needed to update prompts
// ─────────────────────────────────────────────────────
const DEFAULT_PROMPTS = {
  ceo: `You are the CEO Agent of Universe AI Company. You report directly to Chairman Ernie Park.

PRODUCTION GOALS:
- 2 Shorts per day x 11 languages = 22 short uploads/day
- 2 long-form videos per week x 11 languages = 22 long-form uploads/week
- Phase 1: CosmosEdge space science channel only. Budget: $175/month.

DAILY BRIEF FORMAT (max 150 words):
STATUS: GREEN/YELLOW/RED emoji
SHORT-FORM: today score and topic
LONG-FORM: this week score and topic if applicable
PRODUCTION: what is ready for Chairman approval
DECISIONS: exactly 3 YES/NO decisions for Chairman
TONIGHT FOCUS: one specific 7PM-10PM KST action

WEEKLY (every Monday): 2 long-form topics + 14 short-form topics + last week review.
Be direct. No filler.`,

  content: `You are the Content Director of Universe AI Company. You lead the Content Team.

PRODUCTION GOALS: 2 Shorts/day + 2 long-form/week. All 11 languages. Target 9.0+/10.

SHORT-FORM (TARGET 32s, HARD MAX 40s — never exceed): HOOK(0-3s max 12 words specific number no questions), AMPLIFICATION(3-7s one escalating sentence), RE-HOOK(7-11s personal stakes), CORE(11-26s 2-3 NASA/ESA facts with sources), LOOP TRIGGER(26-32s unresolved question). US English. Label sections with timestamps.

WHEN TRANSLATING:
- Use ## LANGUAGE NAME header for each (e.g. ## German, ## French)
- Preserve HOOK AMPLIFICATION RE-HOOK CORE LOOP TRIGGER labels in English
- Indonesian: max 35s shorten if needed
- Arabic: add Islamic science connection
- Korean: add community loyalty ending
- Japanese: calm precise tone
- All others: cultural adaptation not literal translation

WEEKLY: Monday select 2 long-form + 14 short-form topics. Daily write 2 Short scripts.`,

  originality: `You are the Originality Agent of Universe AI Company. Content Team.

PRODUCTION GOALS: Check every script before production. 2 Shorts/day + 2 long-form/week = 16 checks/week. Zero unverified facts published.

CHECKS: 1.Verify all facts from NASA.gov ESA.int or peer-reviewed journals. 2.Check topic not covered in last 60 days. 3.Flag any unverifiable claim.

OUTPUT: APPROVED with source list per fact. NEEDS REVISION with exact claim to fix and correct source. REJECT TOPIC if covered too recently with 2 alternative topic suggestions. Be concise max 150 words.`,

  seo: `You are the SEO Agent of Universe AI Company. Content Team.

PRODUCTION GOALS: SEO for 2 Shorts/day + 2 long-form/week. All 11 language markets.

SHORT-FORM: TITLE(max 60 chars keyword first power word), DESCRIPTION(150 words keyword-rich), HASHTAGS(exactly 5 #Shorts first never #viral #fyp), TIKTOK CAPTION(150 chars emoji), PINNED COMMENT(question drives replies first hour).

LONG-FORM: TITLE(max 60 chars keyword first no clickbait), DESCRIPTION(300 words chapter timestamps embedded), TAGS(12 search terms), END SCREEN CTA(exact subscribe phrase), CARD SUGGESTIONS(2 related topics).

For non-English channels: translate title and description to channel language.`,

  thumbnail: `You are the Thumbnail Agent of Universe AI Company. Content Team.

PRODUCTION GOALS: Create thumbnails for 2 Shorts/day + 2 long-form/week. Full automation. Zero manual work.

IMPORTANT: Always end your response with the QUALITY SCORE section in this exact format:
OVERALL: X.X/10

COSMOSEDGE LOCKED STYLE GUIDE:
COLOR: Background #0A0E1A, Cosmic Blue #1E3A8A-#3B82F6, Stellar Gold #FDB913, White text #FFFFFF
TYPOGRAPHY: Montserrat ExtraBold ALL CAPS, 180-220px, top third, max 15-20 chars
LIGHTING: 45-degree golden key light + white rim light on subject edges + cool blue fill
VISUAL: Photorealistic IMAX, single hero subject center 60% frame, HDR 80% brightness, cosmic dust particles
LAYOUT SHORTS (9:16): Text top-third (200-550px), hero lower center (1100-1600px), CE logo bottom right
LAYOUT LONG-FORM (16:9): Subject left 60%, bold text right or center, logo bottom right

YOUR OUTPUT — produce all 4 sections:

1. SHORTS IDEOGRAM PROMPT (9:16 ready for API):
[COSMOSEDGE STYLE LOCK] Cinematic vertical 9:16 photorealistic IMAX. Deep space #0A0E1A + cosmic blue #1E3A8A radial gradient. 45-degree golden key light #FDB913, white rim lighting, cool blue fill. Cosmic dust 20-30% opacity. Hero subject sharp center 60% width HDR 80% brightness. Bold white ALL-CAPS text top-third: "[HOOK TEXT 5 WORDS MAX]". [SPECIFIC VISUAL]. No people. YouTube Shorts thumbnail quality.

2. LONG-FORM IDEOGRAM PROMPT (16:9 ready for API):
[COSMOSEDGE STYLE LOCK] Dramatic horizontal 16:9 cinematic space photorealistic IMAX. Deep space #0A0E1A + cosmic blue gradient. Golden key light + white rim. Bold ALL-CAPS text: "[TITLE 6 WORDS MAX]". A/B VARIANT: [alternative]. [SPECIFIC VISUAL]. YouTube thumbnail quality.

3. SEEDANCE 2.0 PROMPT (max 100 words, camera movements per section):
Vertical 9:16 dark space cinematic.
HOOK (0-3s): [camera movement + visual]
AMPLIFICATION (3-7s): [camera movement + visual]
RE-HOOK (7-11s): [camera movement + visual]
CORE (11-26s): [camera movement + visual]
LOOP TRIGGER (26-32s): [pull back — perfect loop]

4. QUALITY SCORE:
IDEOGRAM QUALITY: X/10 — [reason]
HOOK TEXT: X/10 — [reason]
CTR POTENTIAL: X/10 — [reason]
SEEDANCE QUALITY: X/10 — [reason]
OVERALL: X.X/10 — [verdict]
If below 9.0: rewrite weakest section immediately.`,

  pioneer: `You are the Pioneer Agent of Universe AI Company. Content Team. Strategy: 70% fast-follower 30% original. WEEKLY: Monitor top 50 space channels. Identify 3 videos 3x+ above average. Recommend fast-follow format. Suggest one original experiment. FAST-FOLLOW: Copy format not content. Different topic same hook structure. Publish within 48 hours. Must score 9.0+ before production. WEEKLY REPORT: TOP OUTLIER, FAST-FOLLOW recommendation, EXPERIMENT to try, AVOID this week.`,

  intelligence: `You are the Intelligence Director of Universe AI Company. Intelligence Team. PRODUCTION GOALS: Support 2 Shorts/day + 2 long-form/week topic selection. Monitor competitors daily. Fast-follow within 48 hours. DAILY: Monitor top 50 space channels. Track viral outliers 3x+ average. Alert Chairman immediately. WEEKLY REPORT (Monday): TOP TREND format getting 3x+ views, FAST-FOLLOW recommended topic, AVOID underperforming topics, OPPORTUNITY emerging before competitors. Our advantage: 11 languages simultaneously vs competitors English only.`,

  performance: `You are the Performance Agent of Universe AI Company. Intelligence Team.

PRODUCTION GOALS: Score every Short and long-form before production. 2 Shorts/day + 2 long-form/week. Minimum 9.0/10 both formats.

SHORT-FORM (0-10 each): HOOK STRENGTH (specific number no question instant tension under 12 words), PACING (re-hook 7s loop trigger 32s), SHAREABILITY (mind-blowing fact emotional peak viral). OVERALL X.X/10.

LONG-FORM (0-10 each): COLD OPEN (shocking number grabs 30s no generic intro), RETENTION ARC (cliffhanger every section dropout risk), MONETIZATION (mid-rolls 5:00 and 8:00 natural phrases), INFO DENSITY (2-3 facts per section specific numbers), SUBSCRIPTION HOOK (0-10): Must have ALL 3: next video named + word subscribe + Tuesday Friday schedule. OVERALL X.X/10.

If below 9.0: exactly 3 specific improvements with example rewrites. Long-form: rate dropout risk per section LOW/MEDIUM/HIGH.`,

  market: `You are the Market Intelligence Agent of Universe AI Company. Intelligence Team. PRODUCTION GOALS: Optimize for 11 markets. Support 2 Shorts/day + 2 long-form/week. MARKET PROFILES: English=broad global competitive, German=loyal prefers 55s Shorts, French=cultural pride, Spanish=largest non-English shareable, Portuguese=Brazil informal community, Italian=educated accurate, Hindi=educational huge growth, Indonesian=max 35s captions only no narration, Korean=community loyalty series format, Japanese=calm precise technical, Arabic=Islamic science connections educational. WEEKLY: FASTEST GROWING market, BEST TOPIC PER MARKET, UPLOAD TIMING per timezone.`,

  retention: `You are the Audience Retention Agent of Universe AI Company. Intelligence Team. PRODUCTION GOALS: Series formats for 2 Shorts/day + 2 long-form/week. Target 10%+ return viewers. Every video is part of a series. SHORTS SERIES: Every topic = Part 1 Part 2 Part 3. End screen 30s: "Part 2 drops [DAY] subscribe now." LONG-FORM SERIES: Every long-form is 2-episode series. Tuesday=Episode 1 Friday=Episode 2. Episode 1 cliffhanger teases Episode 2. WEEKLY: SERIES IN PROGRESS, RETURN RATE ESTIMATE, NEXT EPISODE to create.`,

  secretary: `You are the Secretary and Operations Director of Universe AI Company. Operations Team. PRODUCTION GOALS: Upload schedule for 2 Shorts/day + 2 long-form/week. 11 channels. DAILY UPLOAD TIMES: English/German/French/Italian=9AM+6PM local. Spanish/Portuguese=8AM+7PM local. Korean/Japanese=7AM+8PM KST. Hindi=8AM+9PM IST. Indonesian=7AM+7PM WIB. Arabic=8AM+8PM AST. LONG-FORM: Tuesday=Episode 1 all 11 channels. Friday=Episode 2 all 11 channels. CHECKLIST per video: Title description hashtags thumbnail playlist cards.`,

  community: `You are the Community Agent of Universe AI Company. Operations Team. PRODUCTION GOALS: Engage viewers on 2 Shorts/day + 2 long-form/week. Pinned comment within 30 minutes of every upload. PINNED COMMENT: "[Video topic question] — what do YOU think? Drop answer below" 5 RESPONSE TEMPLATES: Skeptical="Great question! Science actually shows...", Amazed="Right? Wait until Part 2 on [DAY]...", Wrong fact="Actually NASA confirmed [CORRECT FACT]", Subscribe question="New Shorts every day long-form Tuesday and Friday — subscribe!", Share="Share with someone who thinks they know space" WEEKLY: mine top comments for next video ideas.`,

  compliance: `You are the Compliance Agent of Universe AI Company. Operations Team.

PRODUCTION GOALS: Check every Short and long-form. 2 Shorts/day + 2 long-form/week = 16 checks/week. Zero real violations.

NEVER FLAG: dramatic language death force cosmic horror terrifying impossible. Existential themes. Theory framed as theory. These are standard top science channel language used by Veritasium Kurzgesagt NASA itself.

FLAG ONLY: 1.FACTUAL ERROR provably false with source. 2.UNVERIFIABLE CITATION specific study not findable. 3.COPYRIGHT unlicensed music or footage. 4.MISLEADING theory as confirmed fact. 5.AI DISCLOSURE required by platform.

OUTPUT: Start your response with exactly one verdict word on its own line — either "CLEARED" (no violations) or "FLAGGED" (one or more violations). CLEARED: follow with verification list. FLAGGED: follow with exact violation and exact fix, and write "DO NOT PUBLISH" until fixed.`,

  growth: `You are the Growth Agent of Universe AI Company. Operations Team. PRODUCTION GOALS: Track YPP with 2 Shorts/day + 2 long-form/week. 22 Shorts + 22 long-form uploads/week total. YPP: 1000 subscribers + 10M Shorts views OR 4000 watch hours per channel. TARGETS: Month 1=100 subs per channel. Month 2=500 subs English. Month 3=English hits 1000 YPP application. Month 6=3 channels monetized. WEEKLY: track each channel subs views percent to YPP projected date. ALERT Chairman when any channel hits 900 subscribers.`,

  collaboration: `You are the Collaboration Agent of Universe AI Company. Operations Team. PRODUCTION GOALS: Cross-promote across 11 channels. Support 2 Shorts/day + 2 long-form/week growth. WEEKLY PLAN: Monday=English promotes Korean+Arabic. Tuesday=German promotes French+Spanish. Wednesday=Japanese promotes Hindi+Indonesian. Thursday=Portuguese promotes Italian+English. Friday=all channels link to week long-form Episode 2. END SCREEN: Shorts="Also on CosmosEdge [LANGUAGE1] and [LANGUAGE2]". Long-form="Watch in [LANGUAGE] on CosmosEdge [LANGUAGE]". TARGET: 10% of English subscribers also subscribe to one other language channel.`,

  subgrowth: `You are the Subscriber Growth Agent of Universe AI Company. Operations Team. PRODUCTION GOALS: Convert viewers to subscribers on 2 Shorts/day + 2 long-form/week. Target 0.5%+ conversion. SHORTS: End screen 30s="Part [N] drops [DAY] subscribe now." Every Short is Part of 3-part series never standalone. LONG-FORM: Subscription hook 11:00 names next specific video. Mid-roll reminder 8:00="Subscribe before Part 2 drops Friday." End card 20s subscribe button + next video preview. Series drives 3x higher subscription rate than standalone videos.`,

  finance: `You are the Finance Director of Universe AI Company. Business Team. PRODUCTION GOALS + BUDGET: 2 Shorts/day + 2 long-form/week. Monthly budget $175. COSTS: Seedance $0.80/video x 68 videos = $54.40. ElevenLabs Pro $99.00. Short pipeline $0.18 x 60 = $10.80. Long pipeline $0.08 x 8 = $0.64. Canva $15.00. TOTAL $169.84/month under budget by $5.16. WEEKLY: actual vs $175 budget. Cost per video target under $3.00. Revenue $0 until Month 3 YPP. ALERT Chairman if projected spend exceeds $175.`,

  bizdev: `You are the BizDev Agent of Universe AI Company. Business Team. PRODUCTION GOALS: Revenue alongside 2 Shorts/day + 2 long-form/week. Month 1-2 build audience. Month 3+ activate revenue. TIMELINE: Month 1-2=email list free Space Fact newsletter. Month 3 (1K subs YPP)=AdSense $200-500/month. Month 6 (10K)=Gumroad $9.99 product + affiliate $1K-3K/month. Month 12 (100K)=sponsorships $5K-15K/month. WEEKLY: track email signups, identify affiliate opportunities, prepare YPP application.`,

  brand: `You are the Brand Agent of Universe AI Company. Business Team. PRODUCTION GOALS: Consistent brand across 2 Shorts/day + 2 long-form/week. IDENTITY: Name=CosmosEdge. Tagline="The universe is more terrifying and more beautiful than you can imagine." Closing="This is CosmosEdge where the universe has no edges." Visual=dark space deep blue/purple white text cinematic. POSTING SCHEDULE (all channel descriptions): New Shorts every day. Long-form every Tuesday and Friday. MEMBERSHIPS at 10K subs: Stargazer $2.99 early Shorts. Explorer $7.99 early access + behind scenes. Cosmologist $19.99 everything + monthly Q&A.`,

  technology: `You are the Technology Agent of Universe AI Company. Business Team. PRODUCTION GOALS: Optimal tech stack for 2 Shorts/day + 2 long-form/week. Monitor weekly every Monday. CURRENT STACK: Seedance 2.0 $0.80/video. ElevenLabs Pro $99/month. Claude Sonnet+Haiku API. FFmpeg free. Canva Pro $15/month. WEEKLY: any better cheaper alternatives? price changes? new tools worth testing? ROADMAP: Month 2=YouTube API auto-upload. Month 3=thumbnail auto-generation. Month 6=full zero-touch pipeline.`,

  collector: `You are the Asset Collector Agent of Universe AI Company. Content Team. PRODUCTION GOALS: Find assets for 2 Shorts/day + 2 long-form/week. Shorts=8 assets. Long-form=10 assets. FREE SOURCES (priority): 1.NASA images.nasa.gov public domain. 2.ESA esa.int free with attribution. 3.Hubble hubblesite.org free commercial. 4.Chandra chandra.harvard.edu free commercial. 5.JWST webbtelescope.org free commercial. 6.Solar Dynamics Observatory sdo.gsfc.nasa.gov. 7.Pexels free commercial. 8.Pixabay free commercial. OUTPUT per asset: NAME, URL, LICENSE, RELEVANCE/10, SECTION (which video section to use in), FORMAT.`,

  assetqa: `You are the Asset QA Agent of Universe AI Company. Content Team. PRODUCTION GOALS: Review all assets for 2 Shorts/day + 2 long-form/week. Target 8+ of 10 assets approved per batch. CRITERIA (all must pass): 1.LICENSE free commercial no attribution required. 2.RELEVANCE 7+ to script topic. 3.QUALITY 1080p+ images 720p+ video. 4.FORMAT croppable to 9:16 vertical. 5.IMPACT stops viewer from scrolling not generic stock. OUTPUT per asset: APPROVED one-line reason. REJECTED specific reason + alternative suggestion.`,

  longform: `You are the Long-Form Content Agent of Universe AI Company. Content Team.

PRODUCTION GOALS: 2 long-form per week (10-12 minutes). Target 9.0+/10. Tuesday + Friday episodes as 2-part series.

CRITICAL RULES:
1. COLD OPEN (0:00-0:30): Most shocking specific number. NO greeting. NO intro.
2. Every section ends with CLIFFHANGER: "But here is what nobody tells you..." or "And this is where it gets truly terrifying..." or "Stay with me because the next part rewrites everything..."
3. Mid-roll 5:00: "We have covered [X]. But what comes next makes this look minor. Stay with me."
4. Mid-roll 8:00: "You now understand [X]. One final twist changes everything."
5. MANDATORY SUBSCRIPTION HOOK at 11:00 — NEVER OMIT: Write exactly: "If this disturbed you, wait until you see [NAME THE SPECIFIC NEXT VIDEO]. Subscribe now — I post every Tuesday and Friday." If this section is missing your script is INCOMPLETE.
6. 2-3 NASA/ESA verified facts with source name per section
7. Personal stakes — connect every section to viewer personally

STRUCTURE: 0:00-0:30 COLD OPEN, 0:30-1:00 INTRO, 1:00-3:00 CONTEXT, 3:00-5:00 DEEP DIVE 1 + CLIFFHANGER, 5:00 MID-ROLL 1, 5:00-8:00 DEEP DIVE 2 + CLIFFHANGER, 8:00 MID-ROLL 2, 8:00-11:00 CONCLUSION TWIST + CLIFFHANGER, 11:00-12:00 SUBSCRIPTION HOOK naming next video.

IMPORTANT: Write the SUBSCRIPTION HOOK section LAST. Use this EXACT format: "If this disturbed you, wait until you see [NEXT SPECIFIC VIDEO TITLE]. Subscribe now — I post every Tuesday and Friday."

Include exact timestamps, [SPEAKER NOTE] delivery tips, chapter timestamps at end. US English.`,

  sponsorship: `You are the Sponsorship Agent of Universe AI Company. Business Team. PRODUCTION GOALS: Sponsorship pipeline alongside 2 Shorts/day + 2 long-form/week. First deals at 5K subscribers Month 4. RATE CARD: 1K=$50-100/long-form. 10K=$500-1K/long-form. 100K=$2K-5K/long-form. Shorts=50% of long-form rate. TARGETS at 5K: Brilliant.org $300-500. SkySafari $200-400. Telescope brands $400-800. MONTHLY: update subscriber count, new outreach targets, prepare case study.`,

  audit: `You are the Audit Agent of Universe AI Company. Report directly to Chairman Ernie Park. PRODUCTION GOALS: Independently verify every video. 2 Shorts/day + 2 long-form/week = 16 audits/week. Zero factual errors published. YOUR 4 CHECKS ONLY: 1.FACTS: all 3 core facts verifiable from NASA.gov ESA.int or peer-reviewed? List each with source. 2.COMPLIANCE: Compliance Agent output CLEARED? 3.ASSETS: approved by Asset QA? 4.SCORE: Performance Agent score reasonable for this script? DO NOT FLAG: missing translations, dramatic language, business decisions, system performance. OUTPUT: GREEN all 4 passed ready. YELLOW minor issue proceed with note. RED specific factual error must fix. Max 150 words.`,

  monitor: `You are the System Monitor Agent of Universe AI Company. Report directly to Chairman Ernie Park. PRODUCTION GOALS: Reliable operation for 2 Shorts/day + 2 long-form/week. Health check before every 7PM KST session. 7 HEALTH CHECKS: 1.API KEY valid and responding. 2.Claude Haiku + Sonnet both responding. 3.Content Director generates Short script 8.0+. 4.Performance Agent scores correctly. 5.Pipeline button accessible on home screen. 6.Local storage saving correctly. 7.All 28 agents loaded. STATUS: GREEN=ready to run pipeline. YELLOW=proceed with caution. RED=fix before pipeline. Format: STATUS emoji then each check PASS/FAIL then one RECOMMENDATION.`,

  ffmpeg: `You are the FFmpeg Production Agent of Universe AI Company. Content Team. PRODUCTION GOALS: Automate production for 2 Shorts/day + 2 long-form/week. Zero manual editing. All 11 languages. SPECS: Shorts=1080x1920 vertical 32s 30fps libx264 crf18 aac 192k. Long-form=1920x1080 horizontal 10-12min. Audio: narration 100% music 25% bass hit at 0s full volume. Base path C:/UniverseAI/. Languages: EN DE FR ES PT IT HI ID KR JP AR. OUTPUT: complete Windows .bat file looping 11 languages with echo progress and error handling.`,

  advisor: `You are the Advisor Agent of Universe AI Company. Report directly to Chairman Ernie Park. PRODUCTION GOALS: Support Chairman for 2 Shorts/day + 2 long-form/week. Target $150,000 net profit/year. DAILY BRIEF (max 150 words): DAILY LESSON: one specific insight from today pipeline results. TONIGHT ACTION (7PM-10PM KST): one specific task with exact steps. WEEK 1 PRIORITY: single most important focus for CosmosEdge. STRATEGIC MILESTONES: Month 1=consistency publish every day. Month 2=optimize from YouTube data. Month 3=YPP English channel. Month 6=add MindVault channel. Month 12=all 10 channels live. Always specific never generic. One decision at a time. Conservative spending aggressive content quality.`
};

// ─────────────────────────────────────────────────────
// CORS HEADERS
// ─────────────────────────────────────────────────────
function corsHeaders(origin) {
  const allowed = ['https://claude.ai', 'https://erniepark527-netizen.github.io'];
  const isAllowed = !origin || allowed.some(a => origin.startsWith(a));
  return {
    'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : 'https://erniepark527-netizen.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) }
  });
}

// ─────────────────────────────────────────────────────
// CLAUDE API CALL
// ─────────────────────────────────────────────────────
async function callClaude(apiKey, model, system, userMsg, maxTokens = 1000, tools = null) {
  const modelId = model === 'Sonnet'
    ? 'claude-sonnet-4-5'
    : 'claude-haiku-4-5-20251001';

  // PROMPT CACHING: system prompts > 500 chars get an ephemeral cache_control block.
  // Repeated agent calls within the 5-min window get a cache hit (~90% input-token cost cut
  // on the system prefix). Small test calls (< 500 chars) stay as plain strings.
  const systemBlock = typeof system === 'string' && system.length > 500
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system;

  const body = {
    model: modelId,
    max_tokens: maxTokens,
    system: systemBlock,
    messages: [{ role: 'user', content: userMsg }],
  };
  if (tools && tools.length) body.tools = tools;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Claude API error ${res.status}`);
  }

  const data = await res.json();
  // Robust extraction: a web_search response interleaves server_tool_use /
  // web_search_tool_result blocks with the final text, so join ALL text blocks
  // rather than assuming content[0].
  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  return { text, usage: data.usage || {} };
}

// ─────────────────────────────────────────────────────
// GEMINI TOPIC POOL — daily batch via cron. Gemini acts as Chief Editor,
// generating 10 hook-ready topics across all 3 verticals (80% suspense,
// 20% triumph). Stored in env.TOPIC_POOL KV with 24h TTL.
// REQUIRES: env.GEMINI_API_KEY + a TOPIC_POOL KV namespace bound in Cloudflare.
// ─────────────────────────────────────────────────────
async function generateTopicPool(env) {
  if (!env.GEMINI_API_KEY || !env.TOPIC_POOL) return { count: 0, error: 'missing env: GEMINI_API_KEY or TOPIC_POOL' };
  const prompt =
    `You are Chief Editor for a multi-vertical documentary YouTube network (COSMOS: space science,\n` +
    `CAPITAL: business/finance, TERRA: earth systems/climate). Generate exactly 10 highly specific,\n` +
    `hook-ready short-documentary topics for today. Apply 80/20: 8 with suspense/crisis/mystery angle,\n` +
    `2 with awe/triumph/resilience. Ultra-specific — NOT "climate crisis" but "The day the AMOC\n` +
    `current could stop". Prefix each with its vertical tag, e.g. "[COSMOS] The rogue planet...".\n` +
    `Return ONLY a valid JSON array of exactly 10 topic strings. No commentary, no fences.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2000, temperature: 0.85 },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Robust extraction: find the first [ and last ] to handle any surrounding text
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error(`No JSON array in Gemini response: ${raw.slice(0, 200)}`);
    const topics = JSON.parse(raw.slice(start, end + 1));
    if (Array.isArray(topics) && topics.length > 0) {
      await env.TOPIC_POOL.put('pool', JSON.stringify(topics), { expirationTtl: 86400 });
      return { count: topics.length, error: null };
    }
    throw new Error(`Parsed result is not an array: ${raw.slice(0, 200)}`);
  } catch (e) {
    const errMsg = String(e?.message || e);
    console.error('Topic pool failed:', errMsg);
    return { count: 0, error: errMsg };
  }
}

// ─────────────────────────────────────────────────────
// TELEGRAM NOTIFY (optional)
// ─────────────────────────────────────────────────────
async function tgNotify(env, message, markdown = true) {
  if (!env.TG_TOKEN || !env.TG_CHAT) return;
  try {
    const payload = { chat_id: env.TG_CHAT, text: message };
    if (markdown) payload.parse_mode = 'Markdown';
    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) { /* silent fail */ }
}

// ─────────────────────────────────────────────────────
// PROMPT STORAGE (KV or in-memory fallback)
// ─────────────────────────────────────────────────────
async function getPrompt(env, agentId) {
  // Try KV first (if PROMPTS namespace bound), else use defaults
  if (env.PROMPTS) {
    const stored = await env.PROMPTS.get(`prompt:${agentId}`);
    if (stored) return stored;
  }
  return DEFAULT_PROMPTS[agentId] || '';
}

async function setPrompt(env, agentId, prompt) {
  if (env.PROMPTS) {
    await env.PROMPTS.put(`prompt:${agentId}`, prompt);
    return true;
  }
  // Without KV, update in-memory (lasts for this Worker instance only)
  DEFAULT_PROMPTS[agentId] = prompt;
  return true;
}

// ─────────────────────────────────────────────────────
// EXTRACT SCORE FROM TEXT
// ─────────────────────────────────────────────────────
function extractScore(text) {
  const matches = text.match(/(\d+\.?\d*)\/10/g);
  if (!matches) return 0;
  return parseFloat(matches[matches.length - 1]);
}

// ─────────────────────────────────────────────────────
// COMPLIANCE VERDICT — true only if cleared AND not flagged
// ─────────────────────────────────────────────────────
function isCleared(complianceText) {
  const t = (complianceText || '').toUpperCase();
  // Flagged / blocked language overrides any "CLEARED CLAIMS" sub-section
  if (t.includes('FLAGGED') || t.includes('DO NOT PUBLISH') || t.includes('NEEDS REVISION')) return false;
  return t.includes('CLEARED');
}

// ─────────────────────────────────────────────────────
// v6.0 MULTI-MODEL DISPATCH (OpenAI + Gemini) with Claude fallback
// ─────────────────────────────────────────────────────
async function callOpenAI(apiKey, system, userMsg, maxTokens = 1200) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `OpenAI error ${res.status}`);
  }
  const d = await res.json();
  return { text: d.choices?.[0]?.message?.content || '', usage: d.usage || {} };
}

// ── ElevenLabs TTS ──────────────────────────────────────────────────────────
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const VOICE_MAP = {
  english:  { voice_id: 'n8kTUi6dVrplENT9Un56', name: 'Brian' },
  korean:   { voice_id: 'Gpn64ViAPE8OHwnBHpEs', name: 'Korean Male' },
  arabic:   { voice_id: 'TBD_ARABIC_MALE',       name: 'Arabic Male' },
  japanese: { voice_id: 'TBD_JAPANESE_MALE',      name: 'Japanese Male' },
};
const TTS_SETTINGS = { stability: 0.45, similarity_boost: 0.80, style: 0.25, speaker_boost: true };

async function generateNarration(env, text, language = 'english') {
  if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set');
  const voice = VOICE_MAP[language] || VOICE_MAP.english;
  if (!voice.voice_id || voice.voice_id.startsWith('TBD')) {
    throw new Error(`Voice ID not yet assigned for language: ${language}`);
  }
  const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voice.voice_id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: TTS_SETTINGS,
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.detail?.message || `ElevenLabs error ${res.status}`);
  }
  // Returns audio as ArrayBuffer (mp3)
  const audioBuffer = await res.arrayBuffer();
  // Safe base64 conversion — chunked to avoid call stack overflow on large audio buffers
  const uint8 = new Uint8Array(audioBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
  }
  const base64Audio = btoa(binary);
  return {
    language,
    voice_id: voice.voice_id,
    voice_name: voice.name,
    audio_base64: base64Audio,
    audio_size_bytes: audioBuffer.byteLength,
    content_type: 'audio/mpeg',
  };
}
// ── End ElevenLabs ──────────────────────────────────────────────────────────

// ── Seedance 2.0 Video Generation (Replicate) ───────────────────────────────
const SEEDANCE_MODEL = 'bytedance/seedance-1-lite'; // Seedance 2.0 via Replicate

async function generateVideoClip(env, prompt, format = 'short') {
  if (!env.REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not set');

  const aspectRatio = format === 'short' ? '9:16' : '16:9';
  const duration = format === 'short' ? 5 : 8; // seconds per clip

  // Start prediction
  const startRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.REPLICATE_API_KEY}`,
    },
    body: JSON.stringify({
      version: SEEDANCE_MODEL,
      input: {
        prompt,
        aspect_ratio: aspectRatio,
        duration,
        resolution: '1080p',
      },
    }),
  });

  if (!startRes.ok) {
    const e = await startRes.json().catch(() => ({}));
    throw new Error(e?.detail || `Replicate start error ${startRes.status}`);
  }

  const prediction = await startRes.json();
  const predictionId = prediction.id;

  // Poll for completion (max 120s, every 3s)
  const maxAttempts = 40;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${env.REPLICATE_API_KEY}` },
    });
    const result = await pollRes.json();

    if (result.status === 'succeeded') {
      return {
        prediction_id: predictionId,
        video_url: result.output,
        aspect_ratio: aspectRatio,
        duration_seconds: duration,
        prompt: prompt.substring(0, 100),
      };
    }
    if (result.status === 'failed' || result.status === 'canceled') {
      throw new Error(`Seedance generation ${result.status}: ${result.error || 'unknown'}`);
    }
  }
  throw new Error('Seedance timeout — prediction still processing after 120s');
}

async function generateVideoClips(env, segments, format = 'short') {
  if (!env.REPLICATE_API_KEY) return { error: 'REPLICATE_API_KEY not set', clips: [] };

  // Extract only SEEDANCE 2.0 directives (max 2 for shorts, all for long)
  const seedanceSegments = (segments || [])
    .filter(s => s.visual_directive && s.visual_directive.startsWith('[SEEDANCE 2.0]'))
    .slice(0, format === 'short' ? 2 : 10);

  if (seedanceSegments.length === 0) return { clips: [], message: 'No SEEDANCE segments found' };

  const clips = [];
  for (const seg of seedanceSegments) {
    const prompt = seg.visual_directive.replace('[SEEDANCE 2.0]', '').trim();
    try {
      const clip = await generateVideoClip(env, prompt, format);
      clips.push({ audio: seg.audio, ...clip });
    } catch (e) {
      clips.push({ audio: seg.audio, error: e.message, prompt: prompt.substring(0, 100) });
    }
  }
  return { clips, total_seedance_segments: seedanceSegments.length };
}
// ── End Seedance ─────────────────────────────────────────────────────────────



const GEMINI_MODEL = 'gemini-2.5-flash'; // gemini-1.5/2.0 retired; switch to 'gemini-2.5-pro' for more capability
async function callGemini(apiKey, system, userMsg, maxTokens = 1200) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Gemini error ${res.status}`);
  }
  const d = await res.json();
  return { text: d.candidates?.[0]?.content?.parts?.[0]?.text || '', usage: {} };
}

// Route an AGENTS[key] to its model. If the external key is missing/undefined,
// fall back to Claude so the pipeline never collapses before secrets are set.
async function callAgentV6(env, agentKey, userMsg, maxTokens = 1200) {
  const agent = AGENTS[agentKey];
  if (!agent) throw new Error(`unknown v6 agent: ${agentKey}`);
  const sys = agent.system;

  // External models: use them when a key is present; on missing key OR any
  // runtime failure (bad key, API outage) fall back to Claude so one node can
  // never take the pipeline down. modelUsed / fallbackReason surface what ran.
  if (agent.model === 'gpt-4o') {
    if (env.OPENAI_API_KEY) {
      try {
        const r = await callOpenAI(env.OPENAI_API_KEY, sys, userMsg, maxTokens);
        return { ...r, modelUsed: 'gpt-4o' };
      } catch (e) {
        const r = await callClaude(env.CLAUDE_API_KEY, 'Sonnet', sys, userMsg, maxTokens);
        return { ...r, modelUsed: 'claude-fallback', fallbackReason: String(e?.message || e) };
      }
    }
    const r = await callClaude(env.CLAUDE_API_KEY, 'Sonnet', sys, userMsg, maxTokens);
    return { ...r, modelUsed: 'claude-fallback' };
  }
  if (agent.model === 'gemini') {
    if (env.GEMINI_API_KEY) {
      try {
        const r = await callGemini(env.GEMINI_API_KEY, sys, userMsg, maxTokens);
        return { ...r, modelUsed: 'gemini' };
      } catch (e) {
        const r = await callClaude(env.CLAUDE_API_KEY, 'Haiku', sys, userMsg, maxTokens);
        return { ...r, modelUsed: 'claude-fallback', fallbackReason: String(e?.message || e) };
      }
    }
    const r = await callClaude(env.CLAUDE_API_KEY, 'Haiku', sys, userMsg, maxTokens);
    return { ...r, modelUsed: 'claude-fallback' };
  }
  // Claude-native agents. The researcher gets Anthropic's server-side web_search
  // so its citations are RETRIEVED (real URLs/numbers), not asserted.
  const tier = agent.model === 'claude-sonnet' ? 'Sonnet' : 'Haiku';
  const tools = WEB_SEARCH_AGENTS.has(agentKey)
    ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }]
    : null;
  const r = await callClaude(env.CLAUDE_API_KEY, tier, sys, userMsg, maxTokens, tools);
  return { ...r, modelUsed: tools ? `${agent.model}+search` : agent.model };
}

// Agents that perform live web retrieval (server-side web_search tool).
const WEB_SEARCH_AGENTS = new Set(['researcher']);

// Parse a v6 agent's JSON-only output, tolerating stray fences/prose.
function parseAgentJson(text) {
  if (!text) return {};
  let s = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b !== -1) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return { _parse_error: true, _raw: s.slice(0, 300) };
}

// ─────────────────────────────────────────────────────
// UTF-8 / punctuation sanitation — kills "â€”" mojibake and
// normalizes smart quotes/dashes to ASCII so they can't re-corrupt
// downstream in narration (.srt) or thumbnails.
// ─────────────────────────────────────────────────────
function sanitizeText(s) {
  if (typeof s !== 'string') return s;
  return s
    .normalize('NFC')
    // repair common UTF-8-read-as-cp1252 mojibake triples
    .replace(/\u00E2\u20AC\u201D/g, '-')    // em dash
    .replace(/\u00E2\u20AC\u201C/g, '-')    // en dash
    .replace(/\u00E2\u20AC\u2122/g, "'")    // right single quote
    .replace(/\u00E2\u20AC\u02DC/g, "'")    // left single quote
    .replace(/\u00E2\u20AC\u0153/g, '"')    // left double quote
    .replace(/\u00E2\u20AC\u009D/g, '"')    // right double quote
    .replace(/\u00E2\u20AC\u00A6/g, '...')  // ellipsis
    .replace(/\u00C2\u00A0/g, ' ')          // non-breaking space artifact
    // normalize genuine smart punctuation to plain ASCII
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ');
}

function deepSanitize(obj) {
  if (typeof obj === 'string') return sanitizeText(obj);
  if (Array.isArray(obj)) return obj.map(deepSanitize);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = deepSanitize(obj[k]);
    return out;
  }
  return obj;
}

// ─────────────────────────────────────────────────────
// v6.0 GATE FUNCTIONS
// ─────────────────────────────────────────────────────
async function reviewRetention(env, script) {
  // Gemini (or Claude fallback) — { verdict: PASS|REVISE, notes, ... }
  const r = await callAgentV6(env, 'advisor', JSON.stringify({ script }), 3000);
  const parsed = parseAgentJson(r.text);
  parsed._model = r.modelUsed;
  return parsed;
}

// ── DETERMINISTIC NUMERIC DIFF ENGINE (language-aware, code-level) ──
// Normalizes English + CJK + Arabic-Indic numerics to canonical magnitudes, then
// verifies every magnitude spoken in the script is grounded in verified_facts.
// This runs in code and does NOT trust the LLM's self-grading.
const NUM_SCALE = {
  thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12,
  천: 1e3, 만: 1e4, 억: 1e8, 조: 1e12,   // Korean
  万: 1e4, 億: 1e8, 兆: 1e12,            // Japanese
};
const ARABIC_INDIC = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','٫':'.','٬':'' };
function normalizeDigits(s) {
  return String(s ?? '').replace(/[٠-٩٫٬]/g, ch => ARABIC_INDIC[ch] ?? ch);
}
function extractMagnitudes(text) {
  const t = normalizeDigits(text);
  const out = [];
  // a number, optional comma/decimal, optional scale word (latin or CJK)
  const re = /(\d[\d,\.]*)\s*(thousand|million|billion|trillion|천|만|억|조|万|億|兆)?/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    const num = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(num)) continue;
    const key = m[2] ? (m[2].length > 2 ? m[2].toLowerCase() : m[2]) : null;
    const scale = key ? (NUM_SCALE[key] ?? 1) : 1;
    out.push(num * scale);
  }
  return out;
}
// Returns the list of script magnitudes that are NOT grounded in any verified fact.
// Small counts (<=40: timestamps, "2-3 facts", section numbers) are ignored.
// 10% tolerance allows honest rounding (4M vs 4.3M) while catching gross errors (6.6M vs 4.3M).
function numericDiff(script, verifiedFacts) {
  const factText = (verifiedFacts || []).map(f => f && (f.claim || f.fact || '')).join(' ');
  const factMags = extractMagnitudes(factText);
  const scriptText = [script?.vo_script, script?.title, script?.hook]
    .filter(Boolean).join(' ');
  const tol = 0.10;
  const unmatched = [];
  for (const v of extractMagnitudes(scriptText)) {
    if (v <= 40) continue;
    const ok = factMags.some(fv => fv !== 0 && Math.abs(v - fv) / Math.max(Math.abs(fv), 1) <= tol);
    if (!ok && !unmatched.includes(v)) unmatched.push(v);
  }
  return unmatched;
}

async function auditScript(env, script, verifiedFacts = [], derived = false) {
  // GPT-4o (or Claude fallback) — { verdict, issues, numbers_checked }
  // `derived`: the script is a faithful localization of an already-numerically-verified
  // master, so the LLM must NOT re-judge numbers (it is unreliable at CJK scale words,
  // e.g. it misreads 660억 = 66 billion as "660 billion"). The deterministic engine governs.
  const r = await callAgentV6(env, 'auditor',
    JSON.stringify({ script, verified_facts: verifiedFacts, derived }), 3000);
  const parsed = parseAgentJson(r.text);
  parsed._model = r.modelUsed;

  // Deterministic grounding check — the AUTHORITY on whether a magnitude exists in facts.
  const factMags = extractMagnitudes((verifiedFacts || []).map(f => f && (f.claim || f.fact || '')).join(' '));
  const isGrounded = (str) => {
    const mags = extractMagnitudes(str);
    return mags.length > 0 && mags.every(v => factMags.some(fv => fv !== 0 && Math.abs(v - fv) / Math.max(Math.abs(fv), 1) <= 0.10));
  };

  // LAYER A — LLM ledger: advisory only. An LLM "not-OK" forces a HOLD ONLY if the
  // deterministic engine ALSO fails to ground it. This stops GPT-4o's CJK scale-conversion
  // errors (660억) from false-rejecting a correct, master-derived number. Skipped entirely
  // for derived scripts, whose numbers are pre-verified against the locked master.
  if (!derived) {
    const badNums = (parsed.numbers_checked || []).filter(n =>
      n && n.status && n.status !== 'OK' && !isGrounded(String(n.value_in_script ?? '')));
    if (badNums.length > 0) {
      parsed.verdict = 'REJECT';
      parsed.issues = (parsed.issues || []).concat(badNums.map(n => ({
        original: String(n.value_in_script ?? ''),
        reason: `numeric mismatch vs verified_facts (${n.status})`,
        replacement: String(n.matched_fact ?? '(remove — value not in verified_facts)'),
      })));
      parsed._numeric_hold = true;
    }
  }

  // LAYER B — deterministic numeric diff engine. Skipped for derived scripts: their numbers
  // come directly from the locked English master and are already verified.
  const codeUnmatched = derived ? [] : numericDiff(script, verifiedFacts);
  if (codeUnmatched.length > 0) {
    parsed.verdict = 'REJECT';
    parsed._numeric_hold = true;
    parsed._code_numeric_unmatched = codeUnmatched;
    parsed.issues = (parsed.issues || []).concat(codeUnmatched.map(v => ({
      original: String(v),
      reason: 'code numeric diff: magnitude not grounded in any verified_fact (±10%)',
      replacement: '(use a verified figure or remove this number)',
    })));
  }
  return parsed;
}

// ─────────────────────────────────────────────────────
// v7.0 VALIDATION CHAIN — Researcher → Localize → Script → Attention
//                         → Gemini → GPT-4o → (2 retries)
// ─────────────────────────────────────────────────────
async function runPipelineChain(env, channel, topic, format = 'short', vertical = 'cosmos') {
  const base = `Vertical: ${vertical}. Channel: ${channel}. Format: ${format}. Topic: ${topic}.`;

  // v7.0 STEP 1: verified research FIRST. web_search spends output tokens on
  // search orchestration before the JSON, so give a generous budget (8000) or
  // the fact list truncates mid-output and fails to parse.
  const research = parseAgentJson((await callAgentV6(env, 'researcher', JSON.stringify({ topic }), 8000)).text);
  const usableFacts = (research.facts || research.verified_data || []).filter(f => f && f.usable !== false);

  // GUARD: no usable facts (parse error / truncation / empty) -> HOLD immediately
  // with a clear reason instead of letting the script write a "no facts" message
  // and burning the gate calls on garbage.
  if (usableFacts.length === 0) {
    return {
      research, usableFacts, gatesPassed: false, attempts: 0,
      holdReason: research._parse_error
        ? 'researcher output unparseable/truncated — no facts'
        : 'researcher returned no usable facts',
    };
  }
  const factsBlob = JSON.stringify(usableFacts);

  // STEP 2: localize concepts using the verified facts
  const culture = parseAgentJson((await callAgentV6(env, 'cultural_translator',
    `${base}\nVERIFIED_FACTS: ${factsBlob}`, 1000)).text);

  // STEP 3: script writes from the verified facts + localized context
  const scriptCtx = `VERIFIED_FACTS (use ONLY these; cite their sources, invent nothing): ${factsBlob}\n` +
    `LOCALIZED_CONTEXT: ${JSON.stringify(culture.localized_context ?? '')}\n` +
    `CULTURAL_NOTES: ${JSON.stringify(culture.cultural_notes ?? '')}`;
  let script = deepSanitize(parseAgentJson((await callAgentV6(env, 'script', `${base}\n${scriptCtx}`, 2500)).text));

  // STEP 4: attention pass — rewrites the VO for hook/pacing
  const psych = parseAgentJson((await callAgentV6(env, 'psychology_auditor', JSON.stringify({ script }), 1500)).text);
  if (psych.adjusted_vo_script) script.vo_script = sanitizeText(psych.adjusted_vo_script);

  let advisor = null, audit = null, attempts = 0;

  while (true) {
    advisor = await reviewRetention(env, script); // GATE 1 (Gemini)
    audit = await auditScript(env, script, usableFacts); // GATE 2 (GPT-4o veto + numeric backstop)

    const advisorPass = advisor.verdict === 'PASS';
    const auditPass = audit.verdict === 'PASS';
    if (advisorPass && auditPass) {
      return { research, usableFacts, script, culture, psych, advisor, audit, attempts, gatesPassed: true };
    }
    if (attempts >= 3) {
      // failed 4 consecutive times — caller flags HOLD + alerts Chairman
      return { research, usableFacts, script, culture, psych, advisor, audit, attempts, gatesPassed: false };
    }

    // Revise from the SAME verified facts (never widen beyond them) + gate feedback
    attempts++;
    const feedback = [
      base,
      scriptCtx,
      'Revise to fix ALL of the following and resubmit; do not introduce facts outside VERIFIED_FACTS.',
      advisor.verdict === 'REVISE' ? `RETENTION_NOTES: ${JSON.stringify(advisor.notes ?? advisor)}` : '',
      audit.verdict === 'REJECT' ? `COMPLIANCE_ISSUES: ${JSON.stringify(audit.issues ?? [])}` : '',
    ].filter(Boolean).join('\n');
    script = deepSanitize(parseAgentJson((await callAgentV6(env, 'script', feedback, 2500)).text));
  }
}

// v7.1 HUB — derive the Korean master FROM the locked English master.
// Korean does NOT research independently: it localizes the EN master's exact content,
// bound to the SAME verified_facts, so numbers match by construction and sprawl is
// impossible (it can only convey what the master already contains).
async function deriveKoreanFromMaster(env, enChain, format = 'short', vertical = 'cosmos') {
  const enFacts = enChain.usableFacts || [];
  const factsBlob = JSON.stringify(enFacts);
  const master = enChain.script?.vo_script || '';
  const derivCtx =
    `DERIVATION MODE. Vertical: ${vertical}. Channel: korean. Format: ${format}.\n` +
    `SOURCE_MASTER (approved English master — convey EXACTLY this, nothing more):\n${master}\n` +
    `VERIFIED_FACTS (the master's facts — use ONLY these, keep every number identical): ${factsBlob}\n` +
    `Render SOURCE_MASTER into native Korean. Preserve its single subject and every number exactly; ` +
    `add no object/topic absent from SOURCE_MASTER. Apply KOREAN REGISTER + TERM + INSTANT GLOSS; ` +
    `match the ~32s / 65-75 word Short budget.`;

  // No researcher, no psychology rewrite — those would re-introduce drift/sprawl.
  let script = deepSanitize(parseAgentJson((await callAgentV6(env, 'script', derivCtx, 2500)).text));

  let advisor = null, audit = null, attempts = 0;
  while (true) {
    advisor = await reviewRetention(env, script);
    audit = await auditScript(env, script, enFacts, true);   // derived mode: numbers pre-verified vs EN master
    if (advisor.verdict === 'PASS' && audit.verdict === 'PASS') {
      return { usableFacts: enFacts, script, advisor, audit, attempts, gatesPassed: true, derived_from: 'english' };
    }
    if (attempts >= 3) {
      return { usableFacts: enFacts, script, advisor, audit, attempts, gatesPassed: false, derived_from: 'english' };
    }
    attempts++;
    const feedback = [
      derivCtx,
      'Revise to fix ALL of the following; stay strictly within SOURCE_MASTER and VERIFIED_FACTS.',
      advisor.verdict === 'REVISE' ? `RETENTION_NOTES: ${JSON.stringify(advisor.notes ?? advisor)}` : '',
      audit.verdict === 'REJECT' ? `COMPLIANCE_ISSUES: ${JSON.stringify(audit.issues ?? [])}` : '',
    ].filter(Boolean).join('\n');
    script = deepSanitize(parseAgentJson((await callAgentV6(env, 'script', feedback, 2500)).text));
  }
}

// Plain-text Chairman alert for a HOLD (no Markdown, so a draft with
// stray * or _ can't break delivery).
function buildHoldMessage(channel, format, topic, chain) {
  const issues = (chain.audit?.issues || []).map((it, i) =>
    `${i + 1}. ${it.original || ''}\n   reason: ${it.reason || ''}\n   fix: ${it.replacement || ''}`
  ).join('\n');
  const draft = chain.script?.vo_script
    || (chain.script ? JSON.stringify(chain.script).slice(0, 800) : '');
  const reasonLine = chain.holdReason
    ? `HELD before gates: ${chain.holdReason}`
    : `Auditor REJECTed after ${chain.attempts} retries (final veto reached).`;
  return [
    `🚫 Universe AI — HOLD (manual review needed)`,
    `${channel} / ${format} — ${topic}`,
    reasonLine,
    ``,
    `Rejection reasons:`,
    issues || chain.holdReason || '(auditor returned no structured issues)',
    ``,
    `Draft for correction:`,
    draft || '(no draft — researcher produced no usable facts)',
  ].join('\n');
}

// ─────────────────────────────────────────────────────
// v6.0 YouTube upload metadata compiler (uses schedule.js)
// ─────────────────────────────────────────────────────
function compileUploadMetadata(channel, format, slotIndex, seo, thumbnailPath, baseDate = new Date()) {
  const now = Date.now();
  // Roll-forward guard: never emit a publishAt in the past. Advance the probe
  // date +24h until the resolved slot is BOTH valid and strictly in the future.
  // Shorts step day-by-day; long-form naturally skips to the next Tue/Fri
  // (resolvePublishAt returns null on non-release days, so those steps are skipped).
  let probe = new Date(baseDate);
  let publishAt = null;
  for (let i = 0; i < 8; i++) {
    const candidate = resolvePublishAt(channel, format, slotIndex, probe);
    if (candidate && new Date(candidate).getTime() > now) { publishAt = candidate; break; }
    probe = new Date(probe.getTime() + 24 * 60 * 60 * 1000); // +24h
  }
  if (!publishAt) return null; // no valid future window within the 8-day horizon

  return {
    snippet: {
      title: seo?.title || '',
      description: seo?.description || '',
      tags: (seo?.hashtags || []).map(h => String(h).replace(/^#/, '')),
      categoryId: '28', // Science & Technology
    },
    status: {
      privacyStatus: 'private',
      publishAt,                 // RFC3339 UTC, DST-correct, guaranteed future
      selfDeclaredMadeForKids: false,
    },
    playlistId: (CHANNELS[channel] && CHANNELS[channel].playlistId) || '',
    thumbnailPath: thumbnailPath || '',
    _cronFireUTC: cronFireTimeFor(publishAt), // production should START at this time
  };
}

// ─────────────────────────────────────────────────────
// v7.0 BATCH ENGINE — durable, ONE node per invocation (KV-backed).
// Requires a KV namespace bound as env.PROMPTS. Drains via scheduled() cron
// or manual POST /batch/tick. One video/invocation keeps every run far under
// Workers limits and makes the batch resumable + pausable.
// ─────────────────────────────────────────────────────
const BATCH_KEY = 'UNIVERSE_BATCH_STATE';
const LOCK_KEY = 'BATCH_EXECUTION_LOCK';
const LOCK_TTL = 600;           // seconds — lock auto-expires (must exceed worst-case chunk runtime)
const CHUNK_SIZE = 3;            // nodes per cron run (free plan: keep <=4; paid: up to 5)
const MAX_CONSECUTIVE_ERRORS = 2; // hard-failure freeze threshold

function buildBatchMatrix() {
  const channels = ['english', 'arabic', 'japanese'];
  const nodes = []; let i = 0;
  for (const channel of channels) {
    for (let s = 0; s < 14; s++) nodes.push({ i: i++, channel, format: 'short', slot: s % 2, status: 'pending', topic: '' });
    for (let l = 0; l < 4;  l++) nodes.push({ i: i++, channel, format: 'long',  slot: 0,     status: 'pending', topic: '' });
  }
  return nodes; // 3 * (14 + 4) = 54
}

function batchProgress(s) {
  return { cursor: s.cursor, total: s.total, cleared: s.cleared, held: s.held, consecutiveHolds: s.consecutiveHolds, halted: s.halted };
}

async function batchStart(env) {
  if (!env.PROMPTS) throw new Error('KV not bound — bind a namespace as PROMPTS first');
  const nodes = buildBatchMatrix();
  // Step A: one trend call per channel; distribute candidate topics to its nodes.
  for (const channel of ['english', 'arabic', 'japanese']) {
    const t = parseAgentJson((await callAgentV6(env, 'trend', JSON.stringify({ channel, count: 18 }), 1500)).text);
    const cands = (t.candidates || []).map(c => c.topic).filter(Boolean);
    let k = 0;
    for (const n of nodes) if (n.channel === channel) n.topic = cands[k++ % Math.max(cands.length, 1)] || `space mystery ${n.i}`;
  }
  const state = { cursor: 0, total: nodes.length, cleared: 0, held: 0, consecutiveHolds: 0, consecutiveErrors: 0, halted: false, haltReason: '', startedAt: new Date().toISOString(), nodes };
  await env.PROMPTS.put(BATCH_KEY, JSON.stringify(state));
  return state;
}

// Process ONE node end-to-end (text-validation phase). Throws on hard failure.
async function processBatchNode(env, node) {
  const chain = await runPipelineChain(env, node.channel, node.topic, node.format);
  let verdict = 'HOLD';
  if (chain.gatesPassed) {
    const qc = parseAgentJson((await callAgentV6(env, 'qc', JSON.stringify({
      advisor: chain.advisor, auditor: chain.audit, script: chain.script,
    }), 1200)).text);
    verdict = qc.verdict === 'CLEARED' ? 'CLEARED' : 'HOLD';
  }
  await env.PROMPTS.put(`batch:result:${node.i}`, JSON.stringify({
    node, advisor: chain.advisor?.verdict, auditor: chain.audit?.verdict, attempts: chain.attempts, script: chain.script,
  }));
  return verdict;
}

// Drain up to CHUNK_SIZE nodes per invocation. Saves state after EACH node so a
// crash never loses progress. Freezes on consecutive HARD failures (distinct
// from HOLDs, which are valid REJECT verdicts).
async function drainBatchChunk(env) {
  if (!env.PROMPTS) return { error: 'KV not bound' };
  const raw = await env.PROMPTS.get(BATCH_KEY);
  if (!raw) return { error: 'no active batch — POST /batch/start first' };
  const state = JSON.parse(raw);
  if (state.halted) return { halted: true, reason: state.haltReason, ...batchProgress(state) };
  if (state.cursor >= state.total) return { done: true, ...batchProgress(state) };

  const processed = [];
  for (let n = 0; n < CHUNK_SIZE && state.cursor < state.total && !state.halted; n++) {
    const node = state.nodes[state.cursor];
    try {
      const verdict = await processBatchNode(env, node);
      node.status = verdict === 'CLEARED' ? 'cleared' : 'held';
      if (verdict === 'CLEARED') { state.cleared++; state.consecutiveHolds = 0; }
      else { state.held++; state.consecutiveHolds++; }
      state.consecutiveErrors = 0; // a completed node (even a HOLD) clears the error streak
      state.cursor++;
      processed.push({ i: node.i, channel: node.channel, format: node.format, verdict });

      // CEILING 1: >3 consecutive HOLDs -> freeze (content problem)
      if (state.consecutiveHolds > 3) {
        state.halted = true;
        state.haltReason = `>3 consecutive HOLDs at node ${state.cursor}/${state.total}`;
        await tgNotify(env, `🛑 BATCH HALTED — ${state.haltReason}\nCleared:${state.cleared} Held:${state.held}.\nQuality gate tripped; manual review needed.`, false);
      }
    } catch (e) {
      // Hard failure (Claude API down, KV error, etc.) — do NOT advance cursor.
      state.consecutiveErrors = (state.consecutiveErrors || 0) + 1;
      node.status = 'error';
      node.lastError = String(e?.message || e);
      processed.push({ i: node.i, channel: node.channel, format: node.format, verdict: 'ERROR', error: node.lastError });

      // CEILING 2: consecutive API failures -> freeze + push trace (billing-leak guard)
      if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        state.halted = true;
        state.haltReason = `${state.consecutiveErrors} consecutive API failures at node ${state.cursor}/${state.total}`;
        await tgNotify(env, `🛑 BATCH FROZEN — ${state.haltReason}\nLast error: ${node.lastError}\nCleared:${state.cleared} Held:${state.held}. Cron will not advance; investigate then resume.`, false);
      }
    }
    await env.PROMPTS.put(BATCH_KEY, JSON.stringify(state)); // persist after every node
  }

  return { processed, chunkSize: CHUNK_SIZE, ...batchProgress(state) };
}

// Single-flight barrier around the drain. BEST-EFFORT: KV has no atomic
// compare-and-set and is eventually consistent, so this shrinks the
// read-modify-write race to a sub-second edge case rather than eliminating it.
// The TTL auto-clears an orphaned lock; the finally releases on the happy path
// and on any managed failure. (A Durable Object is the only true mutex.)
async function drainWithLock(env) {
  if (!env.PROMPTS) return { error: 'KV not bound' };

  // MUTEX BARRICADE: if a lock exists, abort immediately — touch nothing else.
  const existing = await env.PROMPTS.get(LOCK_KEY);
  if (existing) return { locked: true, lockedSince: existing };

  // Acquire with a unique token + read-back verify (reduces the TOCTOU window).
  const token = crypto.randomUUID();
  await env.PROMPTS.put(LOCK_KEY, token, { expirationTtl: LOCK_TTL });
  const owner = await env.PROMPTS.get(LOCK_KEY);
  if (owner !== token) return { locked: true, lockedSince: owner }; // lost the race — do NOT release

  try {
    return await drainBatchChunk(env);
  } finally {
    // ATOMIC RELEASE: clear the lock so the next slot can proceed.
    await env.PROMPTS.delete(LOCK_KEY);
  }
}

// ─────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────
export default {
  // Cron drain: one node per fire (configure a cron trigger to enable).
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      // 1. Refill Gemini topic pool for the day (non-blocking on failure)
      await generateTopicPool(env).catch(() => {});
      // 2. Drain the batch execution queue
      await drainWithLock(env);
    })());
  },

  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {

      // ── GET /health ──────────────────────────────────
      if (path === '/health' && request.method === 'GET') {
        const apiKey = env.CLAUDE_API_KEY;
        let apiStatus = 'ERROR';
        try {
          await callClaude(apiKey, 'Haiku', 'test', 'say OK', 10);
          apiStatus = 'OK';
        } catch (e) { apiStatus = e.message; }

        return json({
          status: apiStatus === 'OK' ? 'GREEN' : 'RED',
          api: apiStatus,
          agents: Object.keys(DEFAULT_PROMPTS).length,
          registry_agents: Object.keys(AGENTS).length,
          version: '2.0.1',
          timestamp: new Date().toISOString(),
        }, 200, origin);
      }

      // ── GET /prompts ─────────────────────────────────
      if (path === '/prompts' && request.method === 'GET') {
        const all = {};
        for (const id of Object.keys(DEFAULT_PROMPTS)) {
          all[id] = await getPrompt(env, id);
        }
        return json({ prompts: all, count: Object.keys(all).length }, 200, origin);
      }

      // ── PUT /prompts/:id — update one prompt (no GitHub needed) ──
      if (path.startsWith('/prompts/') && request.method === 'PUT') {
        const agentId = path.replace('/prompts/', '');
        if (!DEFAULT_PROMPTS.hasOwnProperty(agentId)) {
          return json({ error: `Unknown agent: ${agentId}` }, 404, origin);
        }
        const body = await request.json();
        const newPrompt = body.prompt || '';
        if (!newPrompt || newPrompt.length < 20) {
          return json({ error: 'Prompt too short' }, 400, origin);
        }
        await setPrompt(env, agentId, newPrompt);
        return json({
          success: true,
          agent: agentId,
          length: newPrompt.length,
          message: 'Prompt updated. No GitHub upload needed.'
        }, 200, origin);
      }

      // ── POST /agent — call single agent ─────────────
      if (path === '/agent' && request.method === 'POST') {
        const apiKey = env.CLAUDE_API_KEY;
        if (!apiKey) return json({ error: 'CLAUDE_API_KEY not set in Worker environment' }, 500, origin);

        const body = await request.json();
        const { agentId, task, maxTokens } = body;

        if (!agentId || !task) {
          return json({ error: 'agentId and task required' }, 400, origin);
        }

        const prompt = await getPrompt(env, agentId);
        if (!prompt) return json({ error: `Unknown agent: ${agentId}` }, 404, origin);

        // Determine model from agent
        const sonnetAgents = ['ceo','content','longform','ffmpeg'];
        const model = sonnetAgents.includes(agentId) ? 'Sonnet' : 'Haiku';
        const tokens = maxTokens || (agentId === 'longform' ? 2500 : agentId === 'thumbnail' ? 1200 : 1000);

        const result = await callClaude(apiKey, model, prompt, task, tokens);
        const score = extractScore(result.text);

        return json({
          text: result.text,
          score,
          agent: agentId,
          model,
          usage: result.usage,
        }, 200, origin);
      }

      // ── POST /pipeline — run mini pipeline ───────────
      if (path === '/pipeline' && request.method === 'POST') {
        const apiKey = env.CLAUDE_API_KEY;
        if (!apiKey) return json({ error: 'CLAUDE_API_KEY not set' }, 500, origin);

        const body = await request.json();
        const { topic, format } = body; // format: 'short' | 'long' | 'both'

        const results = {};
        let totalCost = 0;

        const call = async (agentId, task, maxTok) => {
          const prompt = await getPrompt(env, agentId);
          const sonnet = ['ceo','content','longform','ffmpeg','thumbnail'].includes(agentId);
          const r = await callClaude(apiKey, sonnet ? 'Sonnet' : 'Haiku', prompt, task, maxTok || 1000);
          const inp = r.usage.input_tokens || 0;
          const out = r.usage.output_tokens || 0;
          totalCost += sonnet ? (inp*3+out*15)/1e6 : (inp*0.25+out*1.25)/1e6;
          return r.text;
        };

        // Short-form
        if (!format || format === 'short' || format === 'both') {
          results.script = await call('content', `Write viral CosmosEdge Short about: ${topic}. Specific number in hook.`, 600);
          results.score = extractScore(await call('performance', `Score:\n\n${results.script}`));
          results.seo = await call('seo', `Short SEO:\n\n${results.script}`);
          results.thumbnail = await call('thumbnail', `Thumbnail package:\n\n${results.script}`, 1200);
          results.compliance = await call('compliance', `Check:\n\n${results.script}`);
          results.cleared = isCleared(results.compliance);
        }

        // Long-form
        if (format === 'long' || format === 'both') {
          results.longform = await call('longform', `Write 10-12min CosmosEdge video: ${topic}. ALL rules: cliffhangers, mid-rolls 5:00 8:00, subscription hook Tuesday Friday.`, 2500);
          results.lfScore = extractScore(await call('performance', `Score long-form:\n\n${results.longform}`));
          results.lfCompliance = await call('compliance', `Check long-form:\n\n${results.longform?.slice(0,700)}`);
          results.lfCleared = isCleared(results.lfCompliance);
        }

        results.cost = Math.round(totalCost * 10000) / 10000;
        results.topic = topic;

        // Telegram notification
        const scoreStr = results.score ? `Short: ${results.score}/10` : '';
        const lfStr = results.lfScore ? `Long: ${results.lfScore}/10` : '';
        const clearStr = results.hasOwnProperty('cleared') ? (results.cleared ? '✅ CLEARED' : '⚠️ FLAGGED — review before publishing') : '';
        await tgNotify(env, `*Universe AI Pipeline*\nTopic: ${topic}\n${scoreStr} ${lfStr}\n${clearStr}\nCost: $${results.cost}`);

        return json(results, 200, origin);
      }

      // ── POST /topic-pool/refill — manually trigger Gemini topic pool generation ──
      if (path === '/topic-pool/refill' && request.method === 'POST') {
        if (!env.CLAUDE_API_KEY) return json({ error: 'CLAUDE_API_KEY not set' }, 500, origin);
        const result = await generateTopicPool(env);
        const pool = env.TOPIC_POOL ? await env.TOPIC_POOL.get('pool').catch(() => null) : null;
        return json({ generated: result.count, error: result.error, pool: pool ? JSON.parse(pool) : [] }, 200, origin);
      }

      // ── POST /pipeline-master — v7.1 HUB (EN→KO DERIVATION) ──
      // 1) English master generated + locked (root source of truth).
      // 2) Korean DERIVED from that locked master — no independent research, bound to the
      //    SAME verified_facts, so numbers are consistent by construction and sprawl is
      //    impossible. The loose independent cross-check is removed in favour of derivation.
      // NOTE: EN chain + KO derivation (~13 Sonnet calls) can hit the 30k tok/min tier limit;
      // on a 429, retry shortly after.
      if (path === '/pipeline-master' && request.method === 'POST') {
        if (!env.CLAUDE_API_KEY) return json({ error: 'CLAUDE_API_KEY not set' }, 500, origin);
        const body = await request.json();
        const { format = 'short', vertical = 'cosmos' } = body;
        // Topic from request body OR auto-popped from the Gemini daily topic pool.
        let topic = body.topic;
        if (!topic && env.TOPIC_POOL) {
          try {
            const poolJson = await env.TOPIC_POOL.get('pool');
            if (poolJson) {
              const pool = JSON.parse(poolJson);
              if (pool.length > 0) {
                topic = pool.shift();
                if (pool.length > 0) {
                  await env.TOPIC_POOL.put('pool', JSON.stringify(pool), { expirationTtl: 86400 });
                } else {
                  await env.TOPIC_POOL.delete('pool');
                }
              }
            }
          } catch (_) { /* pool empty or corrupt — fall through */ }
        }
        if (!topic) return json({ error: 'topic required — pool empty (trigger cron or provide topic)' }, 400, origin);

        const slim = (c) => c ? ({
          gatesPassed: c.gatesPassed, attempts: c.attempts,
          auditor_verdict: c.audit?.verdict,
          numeric_hold: c.audit?._numeric_hold ?? false,
          numbers_checked: c.audit?.numbers_checked ?? [],
          code_numeric_unmatched: c.audit?._code_numeric_unmatched ?? [],
          auditor_issues: c.audit?.issues ?? [],
          derived_from: c.derived_from ?? null,
          vo_script: c.script?.vo_script ?? null,
          verified_facts: c.usableFacts ?? [],
        }) : null;

        // STEP 1 — English master = the single, unassailable root.
        const en = await runPipelineChain(env, 'english', topic, format, vertical);
        const enClear = en.gatesPassed === true && en.audit?.verdict === 'PASS';
        if (!enClear) {
          await tgNotify(env, buildHoldMessage('english', format, topic, en), false);
          return json({
            topic, format, version: 'v7.1-hub-derived',
            master_locked: false, stage: 'english_master_hold',
            english: slim(en), korean: null,
          }, 200, origin);
        }

        // STEP 2 — Korean derived strictly from the locked English master.
        const ko = await deriveKoreanFromMaster(env, en, format, vertical);
        const koClear = ko.gatesPassed === true && ko.audit?.verdict === 'PASS';
        const master_locked = enClear && koClear;

        // ── Auto-narration when master is locked ──
        let narration = null;
        if (master_locked && env.ELEVENLABS_API_KEY) {
          try {
            const enText = en.script?.vo_script || '';
            const koText = ko.script?.vo_script || '';
            const [enAudio, koAudio] = await Promise.all([
              enText ? generateNarration(env, enText, 'english') : null,
              koText ? generateNarration(env, koText, 'korean')  : null,
            ]);
            narration = { english: enAudio, korean: koAudio };
            await tgNotify(env,
              `🎙️ NARRATION GENERATED\n${topic}\nEN: ${enAudio?.audio_size_bytes ? Math.round(enAudio.audio_size_bytes/1024)+'KB' : 'failed'}\nKO: ${koAudio?.audio_size_bytes ? Math.round(koAudio.audio_size_bytes/1024)+'KB' : 'failed'}`,
              false);
          } catch (e) {
            narration = { error: e.message };
          }
        }

        // ── Auto-video when master is locked + Replicate key available ──
        let video = null;
        if (master_locked && env.REPLICATE_API_KEY) {
          try {
            const enSegments = en.script?.segments || [];
            video = await generateVideoClips(env, enSegments, format);
            const clipCount = video.clips?.filter(c => !c.error).length || 0;
            await tgNotify(env,
              `🎬 VIDEO CLIPS GENERATED\n${topic}\n${clipCount}/${video.clips?.length || 0} clips succeeded`,
              false);
          } catch (e) {
            video = { error: e.message };
          }
        }

        if (master_locked) {
          await tgNotify(env, `🔒 v7.1 MASTER LOCKED (EN→KO derived)\n${topic}\nEN root ✓  KO derived ✓  same facts, numbers consistent by construction`, false);
        } else {
          await tgNotify(env, buildHoldMessage('korean', format, topic, ko), false);
        }

        return json({
          topic, format, version: 'v7.1-hub-derived',
          master_locked,
          narration,
          video,
          english: slim(en),   // ROOT source of truth (pivot for the future 9-language fan-out)
          korean: slim(ko),    // DERIVED from English master — same facts, localized via KOREAN REGISTER
        }, 200, origin);
      }

      // ── POST /pipeline-v6 — Script→Gemini→GPT-4o(2 retries)→QC→metadata ──
      if (path === '/pipeline-v6' && request.method === 'POST') {
        if (!env.CLAUDE_API_KEY) return json({ error: 'CLAUDE_API_KEY not set' }, 500, origin);
        const body = await request.json();
        const { topic, format = 'short', channel = 'english', vertical = 'cosmos' } = body;
        if (!topic) return json({ error: 'topic required' }, 400, origin);

        const chain = await runPipelineChain(env, channel, topic, format, vertical);
        let qc = null, qc_verdict = 'n/a', upload = null, seo = null, assets = null, revenue = null;

        if (chain.gatesPassed) {
          qc = parseAgentJson((await callAgentV6(env, 'qc', JSON.stringify({
            advisor: chain.advisor, auditor: chain.audit, script: chain.script,
          }), 1200)).text);
          qc_verdict = qc.verdict || 'n/a';

          // SUCCESS BLOCK — cost gate: assets/schedule only after QC = CLEARED
          if (qc_verdict === 'CLEARED') {
            // Parallel asset fork (v7.0 adds sim_engineer)
            const sIn = JSON.stringify({ script: chain.script, channel });
            const [seoR, thumbR, visR, simR, narrR] = await Promise.all([
              callAgentV6(env, 'seo', sIn, 1000),
              callAgentV6(env, 'thumbnail', sIn, 1200),
              callAgentV6(env, 'visual', sIn, 1500),
              callAgentV6(env, 'sim_engineer', sIn, 1500),
              callAgentV6(env, 'narrator', JSON.stringify({ channel }), 600),
            ]);
            seo = deepSanitize(parseAgentJson(seoR.text));
            assets = {
              thumbnail: deepSanitize(parseAgentJson(thumbR.text)),
              visual: deepSanitize(parseAgentJson(visR.text)),
              sim: deepSanitize(parseAgentJson(simR.text)),
              narrator: parseAgentJson(narrR.text),
            };

            // v7.0: append honest contextual monetization to the description
            revenue = deepSanitize(parseAgentJson((await callAgentV6(env, 'revenue_maximizer', sIn, 800)).text));

            upload = compileUploadMetadata(channel, format, 0, seo); // publishAt via schedule.js (EDT/EST + AST)
            await tgNotify(env, `✅ Universe AI — CLEARED\n${channel}/${format}: ${topic}\nQC ${qc.balance_score ?? ''} | publishAt ${upload?.status?.publishAt ?? 'n/a'}`, false);
          }
        } else {
          // FINAL VETO FAILURE — break loop, HOLD, alert Chairman with reasons + draft
          qc_verdict = 'HOLD';
          await tgNotify(env, buildHoldMessage(channel, format, topic, chain), false);
        }

        return json({
          topic, channel, format,
          attempts: chain.attempts,
          advisor_verdict: chain.advisor?.verdict,
          advisor_model: chain.advisor?._model,
          advisor_notes: chain.advisor?.notes ?? null,
          auditor_verdict: chain.audit?.verdict,
          auditor_model: chain.audit?._model,
          auditor_issues: chain.audit?.issues ?? [],
          numbers_checked: chain.audit?.numbers_checked ?? [],
          numeric_hold: chain.audit?._numeric_hold ?? false,
          qc_verdict,
          qc_detail: qc ? { balance_score: qc.balance_score, breakdown: qc.breakdown, reason: qc.reason } : null,
          gatesPassed: chain.gatesPassed,
          verified_facts: chain.usableFacts ?? [],
          researcher_raw: chain.research ?? null,
          upload_metadata: upload,
          assets,
          revenue,
          script: chain.script,
        }, 200, origin);
      }

      // ── BATCH ENGINE routes (durable 54-node matrix) ──
      if (path === '/batch/start' && request.method === 'POST') {
        if (!env.PROMPTS) return json({ error: 'KV not bound — bind a namespace as PROMPTS first' }, 500, origin);
        const state = await batchStart(env);
        return json({ started: true, total: state.total, channels: ['english','arabic','japanese'], note: 'drain via cron or POST /batch/tick' }, 200, origin);
      }
      if (path === '/batch/tick' && request.method === 'POST') {
        const result = await drainWithLock(env);
        const status = result.locked ? 423 : (result.error === 'KV not bound' ? 500 : 200);
        return json(result, status, origin);
      }
      if (path === '/batch/status') {
        if (!env.PROMPTS) return json({ error: 'KV not bound' }, 500, origin);
        const raw = await env.PROMPTS.get(BATCH_KEY);
        return json(raw ? batchProgress(JSON.parse(raw)) : { error: 'no active batch' }, 200, origin);
      }

      // Diagnostic: does the worker SEE each key, and does a live call SUCCEED?
      // Returns booleans + call status only — never the secret values.
      // ── POST /narrate — standalone TTS endpoint ──
      if (path === '/narrate' && request.method === 'POST') {
        if (!env.ELEVENLABS_API_KEY) return json({ error: 'ELEVENLABS_API_KEY not set' }, 500, origin);
        const { text, language = 'english' } = await request.json().catch(() => ({}));
        if (!text) return json({ error: 'text required' }, 400, origin);
        try {
          const result = await generateNarration(env, text, language);
          return json({ ok: true, ...result }, 200, origin);
        } catch (e) {
          return json({ error: e.message }, 500, origin);
        }
      }

      if (path === '/diag') {
        const out = {
          has_claude: !!env.CLAUDE_API_KEY,
          has_openai: !!env.OPENAI_API_KEY,
          has_gemini: !!env.GEMINI_API_KEY,
        };
        if (env.OPENAI_API_KEY) {
          try { await callOpenAI(env.OPENAI_API_KEY, 'Reply with a JSON object {"ok":true}', 'ping json', 50); out.openai_call = 'OK'; }
          catch (e) { out.openai_call = 'ERROR: ' + String(e?.message || e); }
        } else { out.openai_call = 'SKIPPED (key not visible to worker)'; }
        if (env.GEMINI_API_KEY) {
          try { await callGemini(env.GEMINI_API_KEY, 'Reply with {"ok":true}', 'ping', 50); out.gemini_call = 'OK'; }
          catch (e) { out.gemini_call = 'ERROR: ' + String(e?.message || e); }
        } else { out.gemini_call = 'SKIPPED (key not visible to worker)'; }
        return json(out, 200, origin);
      }

      // 404 for unknown paths
      return json({ error: 'Not found', paths: ['/health','/agent','/pipeline','/pipeline-v6','/pipeline-master','/batch/start','/batch/tick','/batch/status','/diag','/prompts','/prompts/:id'] }, 404, origin);

    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: err.message }, 500, origin);
    }
  }
};
