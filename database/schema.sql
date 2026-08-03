-- HeadlineHub AI Database Schema (PostgreSQL 16+)
-- Phase 9 Database Design & Phase 2B Fact-Check Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'reader' CHECK (role IN ('reader', 'editor', 'moderator', 'admin')),
    location VARCHAR(255) DEFAULT 'India',
    preferences JSONB DEFAULT '{"language": "en", "categories": ["national", "tech"]}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

-- 4. MEDIA TABLE
CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    image_url TEXT,
    video_url TEXT,
    audio_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. CRAWLER LOGS TABLE
CREATE TABLE IF NOT EXISTS crawler_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    items_scraped INT DEFAULT 0,
    execution_time_ms INT,
    error_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    channel VARCHAR(50) CHECK (channel IN ('push', 'whatsapp', 'telegram', 'email')),
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE
);
