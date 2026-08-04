# DECISIONS.md — UncosHub AI Architectural & Design Decisions

## 1. Information Architecture (IA) Simplification

**Context**: The previous homepage stacked 7 distinct sections (`HeroMesh`, `IndianLanguageHub`, `NewsFeed`, `FactCheckWidget`, `MultilingualAudioPlayer`, `SocialStudio`, `AdminDesk`). This created severe visual clutter, duplicated language pickers, and exposed operations/admin tools to public visitors.

**Decision**:
- Replaced the multi-widget stack with a streamlined **2-Section Architecture**:
  1. **Section 1: Headlines (`/`)** — Single clean headline feed with global language selection and per-card Sarvam AI TTS audio streaming.
  2. **Section 2: Fact Check (`/verify`)** — Claim verification tool paired with a persistent, grounded AI Chat scoped strictly to claim evidence.
- Moved operations/moderation desk exclusively to `/admin`. Removed standalone widgets (`SocialStudio`, `MultilingualAudioPlayer`, 1000-line `IndianLanguageHub`) from public primary navigation.

---

## 2. Voice AI Integration Strategy (Sarvam AI Primary)

**Primary Provider**: **Sarvam AI (`Bulbul V3` for TTS, `Saaras V3` for STT if voice input is added)**.

**Rationale**:
- **Benchmark Performance**: Independent evaluation (Josh Talks, 20,000+ votes across 11 languages) ranked Bulbul V3 ahead of ElevenLabs v3/v2.5 and Cartesia on naturalness for Indian languages.
- **Indic Content Accuracy**: Lowest character-error-rate (CER) on Indic-specific content including numbers, regional entities, and code-mixed Hinglish.
- **Native Language Coverage**: Native support for the 10+ Indian languages targeted by UncosHub AI (Hindi, Kannada, Tamil, Telugu, Marathi, Bengali, Gujarati, Malayalam, Punjabi, Odia).
- **Latency & Integration**: Sub-250ms streaming via OpenAI-compatible API and official SDKs.

**Fallback / Secondary Provider**: **ElevenLabs**.
- Reserved for English-only content where studio-grade voice customization takes precedence over Indic phonetic accuracy.
- Gated behind a `VoiceProvider` abstract interface (`synthesize(text, language, voice_id) -> audio_stream`).

**Audio Caching Strategy**:
- `POST /api/v1/tts` checks a persistent `voice_cache` table `(id, article_id, language, audio_url, created_at, expires_at)`.
- Re-synthesis is avoided on repeated requests for the same `(article_id, language)` pair to minimize external API costs and eliminate playback latency.

---

## 3. Grounded Fact-Check AI Chat

**Context**: Generic open-ended chatbots tend to hallucinate unverified assertions.

**Decision**:
- Added session-scoped chat (`POST /api/v1/factcheck/{id}/chat`).
- System prompt is strictly constrained to the claims and verified wire/government sources extracted for that specific `fact_check_id`.
- Messages are persisted in `fact_check_messages` table to ensure chat context survives page refreshes.
- User input is sanitized to defend against prompt injection attacks.

---

## 4. Security & Production Hardening

- **CORS Lock**: CORS origins restricted to exact deployed frontend URLs; wildcard `*` with credentials disabled.
- **Rate Limiting**: Applied via `Slowapi` on `/tts` and `/factcheck/{id}/chat` to prevent API cost abuse.
- **Health Check**: Updated `/health` endpoint to perform live database connectivity checks.
