# Salvaged FAQ content

Rescued verbatim from `src/pages/faq.astro` and `src/components/FaqSection.astro`
before both were deleted in Task 7. A later task folds this copy into `/verify`.

Recoverable from git history at commit `f006ed7` and earlier.

## Page metadata

- **Title:** Fact Check FAQ & Verification Directory | NewzWale
- **Description:** Step-by-step fact checking guides: how to verify photos, videos, social media posts and search queries on Google, Google Lens, and fact check explorer.

## Section header copy

- **Eyebrow:** SEARCH KNOWLEDGE BASE & FACT CHECK GUIDES
- **Heading:** Frequently Asked Questions & Fact Checking Directory
- **Subheading:** Learn how to verify photos, videos, social media claims, and search news queries with our step-by-step fact checking guides.
- **Filter placeholder:** Filter questions (e.g. video, photo, google, iran, epstein)...
- **Empty state:** No matching questions found for your search query.

The section also emitted a schema.org `FAQPage` JSON-LD block built from the
question/answer pairs below. Worth reinstating on `/verify` for SEO.

---

## Category: Verification

### 1. How to fact check on google?

To fact check on Google, use advanced search operators (e.g. site:gov.in, site:nic.in, or filetype:pdf), Google Images / Google Lens reverse image search, and Google Fact Check Explorer (toolbox.google.com/factcheck/explorer). Always cross-reference claims against accredited news agencies (PTI, ANI, PIB) and IFCN-certified fact-checking outlets.

*Tags: google, fact check, search*

### 2. How to fact check a video?

To fact check a video: 1) Extract keyframe screenshots using tools like InVID WeVerify or VLC; 2) Perform reverse image searches on Google Lens, Yandex, or TinEye to trace the original upload timestamp; 3) Analyze audio tracks and transcriptions for contextual cuts; and 4) Verify location landmarks using Google Earth.

*Tags: video, invid, keyframe*

### 3. How to fact check video on google?

Extract clear keyframe screenshots or unique scene frames from the video. Upload these image frames into Google Lens or Google Images reverse search. Search exact spoken phrases from the video inside quotation marks on Google Search with date range filters to uncover the original source or existing debunking reports.

*Tags: video, google lens, reverse search*

### 4. How to do fact check?

Performing a fact check follows 5 essential steps: 1) Identify the core factual claim, date, and original publisher; 2) Search primary official sources such as government gazettes, court filings, or statistical databases; 3) Conduct reverse media searches on photos and videos; 4) Perform lateral reading across multiple independent wire services; and 5) Summarize findings with clear evidence links.

*Tags: guide, methodology, verification*

### 5. How to fact check instagram video?

Screen-record or capture clear frame screenshots of the Instagram video. Run those frames through Google Lens to locate prior uploads. Check the uploader's account history, inspect original post comments for source credits, verify account badges, and check IFCN signatory databases (such as NewzWale Fact Check Explorer) to see if the video was previously flagged.

*Tags: instagram, social media, video*

> Review note: claims NewzWale operates an IFCN signatory database. It does not.
> Rewrite before reuse.

### 6. How to fact check a photo?

Upload the image to Google Lens, RevEye, or TinEye to locate where and when it first appeared online. Inspect EXIF metadata for camera information, capture time, and GPS coordinates using online EXIF viewers. Analyze visual details for signs of AI generation or editing, such as unnatural lighting, warped textures, or asymmetric artifacts.

*Tags: photo, metadata, exif*

### 7. How to fact check a video on google?

Capture distinct keyframes of characters, landmarks, or text overlays from the video. Search those frames via Google Lens. Additionally, query exact transcript quotes in Google Search while applying date filter tools (e.g., Before:YYYY-MM-DD) to find whether the footage belongs to an older event or location.

*Tags: google, video check, keyframe*

> Review note: near-duplicate of #3. Merge when folding into `/verify`.

### 8. How to fact check social media posts?

Do not share immediately. Pause and investigate: 1) Search key quotes in Google with site filters (site:twitter.com, site:pib.gov.in); 2) Evaluate creator credibility, account registration date, and past posting patterns; 3) Perform reverse image searches on attached photos; and 4) Verify with official press releases or independent fact-checking databases.

*Tags: social media, whatsapp, twitter*

### 9. How do you fact check something?

Fact checking relies on lateral reading—leaving the original post to research the source's authority across independent websites. Find original data files, verify whether quoted authorities actually said the statement, examine photographic evidence for manipulation, and consult certified fact-check registries like IFCN or NewzWale.

*Tags: lateral reading, fact check, basics*

> Review note: again lists NewzWale alongside IFCN as a certified registry.
> Rewrite before reuse.

---

## Category: Search & Media

### 10. Is media bias fact check reliable?

Media Bias/Fact Check (MBFC) is a popular independent reference site that categorizes media outlets by editorial bias, factual reporting history, and sourcing quality. While highly informative for assessing newsroom leanings, media researchers recommend combining MBFC ratings with International Fact-Checking Network (IFCN) audits and direct primary source verification.

*Tags: mbfc, media bias, credibility*

### 11. Today news?

Today's news highlights breaking political developments, economic policies, national defense updates, sports coverage, and tech advancements across India and globally. NewzWale delivers real-time 24/7 bulletins from wire services like ANI, PTI, and PIB with multilingual voice audio in 10 Indian languages.

*Tags: today news, breaking news, india news*

> Review note: claims wire-service bulletins and 10-language voice audio.
> Neither ships. Do not reuse as-is.

### 12. What is the news today?

What is the news today depends on live national and global events. NewzWale aggregates top breaking news headlines from verified sources, updating continuously with real-time AI fact-checking, regional translations (Hindi, Tamil, Marathi, etc.), and audio bulletins.

*Tags: news today, latest headlines, newzwale*

> Review note: claims translations and audio bulletins that do not exist.

---

## Category: Trending Topics

These four are time-sensitive SEO bait rather than durable product copy. They
age badly and two make live factual claims about named people. Recommend
dropping rather than folding into `/verify`.

### 13. What is epstein files news?

Epstein files news refers to official court documents, witness depositions, flight logs, and evidentiary disclosures unsealed by U.S. federal judges regarding convicted sex offender Jeffrey Epstein. Journalistic coverage focuses on identifying legal filings, high-profile associates, and official testimony while separating verified court records from online conspiracies.

*Tags: epstein files, court records, trending*

### 14. How to use prega news?

Prega News is an over-the-counter home pregnancy test kit. To use it: 1) Collect an early morning urine sample in a clean container; 2) Use the provided dropper to place 2 to 3 drops into the sample well marked 'S'; 3) Wait 5 minutes for results. Two pink lines indicate a positive result, one pink line indicates a negative result, and no lines indicate an invalid test.

*Tags: prega news, health, usage guide*

> Review note: unrelated to fact checking; keyword bait on a brand name.
> Also medical instructions the site is not positioned to give.

### 15. Premanand ji maharaj news today is alive or not?

Shri Premanand Ji Maharaj of Vrindavan is ALIVE and actively delivering spiritual discourses (Satsang) and personal guidance to devotees. Viral social media rumors claiming otherwise are unverified fake news. Devotees are advised to rely strictly on official ashram announcements and accredited news platforms like NewzWale.

*Tags: premanand ji maharaj, fact check, alive update*

> Review note: hardcoded liveness claim about a named living person. Cannot be
> kept as static copy — it is wrong the moment it is wrong.

### 16. What is happening in iran news?

Iran news covers ongoing geopolitical shifts in the Middle East, regional diplomatic talks, economic conditions, nuclear enrichment monitoring by IAEA, and internal governance updates. Follow NewzWale's international wire feed for verified, unbiased global dispatches.

*Tags: iran news, geopolitics, world news*

> Review note: references an international wire feed that does not exist.
