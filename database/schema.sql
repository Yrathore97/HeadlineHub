-- NewzWale Database Schema (PostgreSQL 16+)
-- Phase 9 Database Design & Phase 2B Fact-Check Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    password_hash VARCHAR(255), -- Nullable for OAuth-only users
    google_id VARCHAR(255) UNIQUE, -- Google sub ID
    role VARCHAR(50) DEFAULT 'reader' CHECK (role IN ('reader', 'editor', 'moderator', 'admin')),
    location VARCHAR(255) DEFAULT 'India',
    preferences JSONB DEFAULT '{"language": "en", "categories": ["national", "tech"]}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);

-- 2. ARTICLES TABLE
CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    headline TEXT NOT NULL,
    summary TEXT NOT NULL,
    content TEXT,
    category VARCHAR(100) NOT NULL,
    region VARCHAR(100) DEFAULT 'India',
    state VARCHAR(100),
    district VARCHAR(100),
    language VARCHAR(50) DEFAULT 'en',
    image_url TEXT,
    source TEXT NOT NULL,
    source_url TEXT,
    published_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_state_district ON articles(state, district);
CREATE INDEX idx_articles_language ON articles(language);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);

-- 3. FACT_CHECKS TABLE (PHASE 2B ENGINE)
CREATE TABLE IF NOT EXISTS fact_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submitted_content TEXT NOT NULL,
    submission_type VARCHAR(50) DEFAULT 'text' CHECK (submission_type IN ('text', 'url', 'image', 'forwarded_message')),
    extracted_claims JSONB,
    verdict VARCHAR(50) CHECK (verdict IN ('verified', 'likely_true', 'unverified', 'disputed', 'false')),
    confidence_score DECIMAL(5,4),
    sources_checked JSONB NOT NULL,
    explanation TEXT NOT NULL,
    reviewed_by_human BOOLEAN DEFAULT FALSE,
    reviewer_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fact_checks_verdict ON fact_checks(verdict);
CREATE INDEX idx_fact_checks_human_review ON fact_checks(reviewed_by_human) WHERE reviewed_by_human = FALSE;

-- 4. GROUNDED FACT CHECK MESSAGES TABLE
CREATE TABLE IF NOT EXISTS fact_check_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fact_check_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fact_check_messages_session ON fact_check_messages(fact_check_id);

-- 5. VOICE CACHE TABLE (SARVAM AI TTS AUDIO CACHE)
CREATE TABLE IF NOT EXISTS voice_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id VARCHAR(255) NOT NULL,
    language VARCHAR(50) NOT NULL,
    audio_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_article_language_voice UNIQUE (article_id, language)
);

CREATE INDEX idx_voice_cache_lookup ON voice_cache(article_id, language);

-- 6. MEDIA TABLE
CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    image_url TEXT,
    video_url TEXT,
    audio_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. CRAWLER LOGS TABLE
CREATE TABLE IF NOT EXISTS crawler_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    items_scraped INT DEFAULT 0,
    execution_time_ms INT,
    error_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    channel VARCHAR(50) CHECK (channel IN ('push', 'whatsapp', 'telegram', 'email')),
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE
);

-- 9. REFRESH TOKENS TABLE
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- 10. TRANSLATIONS TABLE (CACHED ARTICLE TRANSLATIONS)
CREATE TABLE IF NOT EXISTS translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    language VARCHAR(50) NOT NULL,
    headline TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_article_language UNIQUE (article_id, language)
);

CREATE INDEX idx_translations_lookup ON translations(article_id, language);
