-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RSS', 'YOUTUBE_CHANNEL', 'SUBSTACK', 'PRIMARY');

-- CreateEnum
CREATE TYPE "SourceTier" AS ENUM ('TIER_1', 'TIER_2', 'DISCOVERY');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'X', 'SUBSTACK');

-- CreateEnum
CREATE TYPE "IngestionMethod" AS ENUM ('RSS', 'API', 'MANUAL');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('COMPANY', 'PERSON', 'PRODUCT', 'ORG');

-- CreateEnum
CREATE TYPE "AliasSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "SynthesisMethod" AS ENUM ('EXTRACTIVE', 'LOCAL_LLM', 'KIMI', 'ANTHROPIC', 'OPENAI', 'GEMINI');

-- CreateEnum
CREATE TYPE "BriefingSection" AS ENUM ('WHAT_HAPPENED', 'WHAT_CHANGED_TODAY', 'HOW_WE_GOT_HERE', 'WHY_IT_MATTERS', 'WHY_PEOPLE_ARE_TALKING', 'WHAT_TO_WATCH_NEXT');

-- CreateEnum
CREATE TYPE "AttachedVia" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('MORE_LIKE_THIS', 'LESS_LIKE_THIS', 'NOT_RELEVANT');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'DEGRADED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "briefingHour" INTEGER NOT NULL DEFAULT 8,
    "briefingMin" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCatalogEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "tier" "SourceTier" NOT NULL,
    "category" TEXT[],
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSourcePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "catalogEntryId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserSourcePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCustomSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCustomSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionState" (
    "id" TEXT NOT NULL,
    "catalogEntryId" TEXT,
    "customSourceId" TEXT,
    "lastPolledAt" TIMESTAMP(3),
    "etag" TEXT,
    "lastModified" TEXT,
    "lastSuccessAt" TIMESTAMP(3),

    CONSTRAINT "IngestionState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorPlatformAccount" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ingestionMethod" "IngestionMethod" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CreatorPlatformAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCreatorFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCreatorFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCreatorPlatformPref" (
    "id" TEXT NOT NULL,
    "userCreatorFollowId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserCreatorPlatformPref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityAlias" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "aliasText" TEXT NOT NULL,
    "source" "AliasSource" NOT NULL DEFAULT 'AUTO',

    CONSTRAINT "EntityAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEntityAffinity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserEntityAffinity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "whatHappened" TEXT,
    "whatChangedToday" TEXT,
    "howWeGotHere" TEXT,
    "whyItMatters" TEXT,
    "whyPeopleAreTalking" TEXT,
    "whatToWatchNext" TEXT,
    "category" TEXT[],
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "synthesisMethod" "SynthesisMethod" NOT NULL DEFAULT 'EXTRACTIVE',
    "rankScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualBoost" INTEGER NOT NULL DEFAULT 0,
    "irrelevant" BOOLEAN NOT NULL DEFAULT false,
    "embedding" vector(384),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicUpdate" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedInDigestDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "publication" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "excerpt" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "tier" "SourceTier" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedSentence" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "section" "BriefingSection" NOT NULL,
    "text" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ExtractedSentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMention" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "url" TEXT NOT NULL,
    "creatorId" TEXT,
    "accountName" TEXT,
    "attachedVia" "AttachedVia" NOT NULL DEFAULT 'MANUAL',
    "surfacedTopic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicEntity" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "TopicEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicDuplicateFlag" (
    "id" TEXT NOT NULL,
    "topicAId" TEXT NOT NULL,
    "topicBId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicDuplicateFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "followedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicSave" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "note" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicSave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoCoverageRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoCoverageRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicMetricSnapshot" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "coverageRequestCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TopicMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingWeights" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceCount" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "sourceReputation" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "coverageVelocity" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    "crossSourceTypeBonus" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "interestOverlap" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "followedCreatorOverlap" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "followupBonus" DOUBLE PRECISION NOT NULL DEFAULT 1.8,
    "novelty" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "primarySourceBonus" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "independentCorroboration" DOUBLE PRECISION NOT NULL DEFAULT 1.3,
    "creatorCoverageCount" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "manualBoostWeight" DOUBLE PRECISION NOT NULL DEFAULT 3.0,

    CONSTRAINT "RankingWeights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "feedback" "FeedbackType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YouTubeQuotaLog" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "callType" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YouTubeQuotaLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "PipelineStatus" NOT NULL DEFAULT 'RUNNING',
    "storiesProcessed" INTEGER NOT NULL DEFAULT 0,
    "topicsCreated" INTEGER NOT NULL DEFAULT 0,
    "topicsUpdated" INTEGER NOT NULL DEFAULT 0,
    "warnings" TEXT[],
    "errorMessage" TEXT,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "SourceCatalogEntry_feedUrl_key" ON "SourceCatalogEntry"("feedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "UserSourcePreference_userId_catalogEntryId_key" ON "UserSourcePreference"("userId", "catalogEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCustomSource_userId_feedUrl_key" ON "UserCustomSource"("userId", "feedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionState_catalogEntryId_key" ON "IngestionState"("catalogEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionState_customSourceId_key" ON "IngestionState"("customSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorPlatformAccount_creatorId_platform_key" ON "CreatorPlatformAccount"("creatorId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "UserCreatorFollow_userId_creatorId_key" ON "UserCreatorFollow"("userId", "creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCreatorPlatformPref_userCreatorFollowId_platform_key" ON "UserCreatorPlatformPref"("userCreatorFollowId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "EntityAlias_aliasText_key" ON "EntityAlias"("aliasText");

-- CreateIndex
CREATE UNIQUE INDEX "UserEntityAffinity_userId_entityId_key" ON "UserEntityAffinity"("userId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_slug_key" ON "Topic"("slug");

-- CreateIndex
CREATE INDEX "Topic_lastUpdatedAt_idx" ON "Topic"("lastUpdatedAt");

-- CreateIndex
CREATE INDEX "TopicUpdate_topicId_createdAt_idx" ON "TopicUpdate"("topicId", "createdAt");

-- CreateIndex
CREATE INDEX "Source_topicId_idx" ON "Source"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_contentHash_key" ON "Source"("contentHash");

-- CreateIndex
CREATE INDEX "ExtractedSentence_sourceId_idx" ON "ExtractedSentence"("sourceId");

-- CreateIndex
CREATE INDEX "SocialMention_topicId_idx" ON "SocialMention"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicEntity_topicId_entityId_key" ON "TopicEntity"("topicId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicDuplicateFlag_topicAId_topicBId_key" ON "TopicDuplicateFlag"("topicAId", "topicBId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicRead_userId_topicId_key" ON "TopicRead"("userId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicFollow_userId_topicId_key" ON "TopicFollow"("userId", "topicId");

-- CreateIndex
CREATE INDEX "TopicReminder_remindAt_fulfilledAt_idx" ON "TopicReminder"("remindAt", "fulfilledAt");

-- CreateIndex
CREATE UNIQUE INDEX "TopicSave_userId_topicId_key" ON "TopicSave"("userId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoCoverageRequest_userId_topicId_key" ON "VideoCoverageRequest"("userId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicMetricSnapshot_topicId_date_key" ON "TopicMetricSnapshot"("topicId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RankingWeights_userId_key" ON "RankingWeights"("userId");

-- CreateIndex
CREATE INDEX "TopicFeedback_userId_topicId_idx" ON "TopicFeedback"("userId", "topicId");

-- CreateIndex
CREATE INDEX "YouTubeQuotaLog_date_idx" ON "YouTubeQuotaLog"("date");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSourcePreference" ADD CONSTRAINT "UserSourcePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSourcePreference" ADD CONSTRAINT "UserSourcePreference_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "SourceCatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomSource" ADD CONSTRAINT "UserCustomSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionState" ADD CONSTRAINT "IngestionState_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "SourceCatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionState" ADD CONSTRAINT "IngestionState_customSourceId_fkey" FOREIGN KEY ("customSourceId") REFERENCES "UserCustomSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorPlatformAccount" ADD CONSTRAINT "CreatorPlatformAccount_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCreatorFollow" ADD CONSTRAINT "UserCreatorFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCreatorFollow" ADD CONSTRAINT "UserCreatorFollow_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCreatorPlatformPref" ADD CONSTRAINT "UserCreatorPlatformPref_userCreatorFollowId_fkey" FOREIGN KEY ("userCreatorFollowId") REFERENCES "UserCreatorFollow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAlias" ADD CONSTRAINT "EntityAlias_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEntityAffinity" ADD CONSTRAINT "UserEntityAffinity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEntityAffinity" ADD CONSTRAINT "UserEntityAffinity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicUpdate" ADD CONSTRAINT "TopicUpdate_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedSentence" ADD CONSTRAINT "ExtractedSentence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialMention" ADD CONSTRAINT "SocialMention_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialMention" ADD CONSTRAINT "SocialMention_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicEntity" ADD CONSTRAINT "TopicEntity_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicEntity" ADD CONSTRAINT "TopicEntity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicDuplicateFlag" ADD CONSTRAINT "TopicDuplicateFlag_topicAId_fkey" FOREIGN KEY ("topicAId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicDuplicateFlag" ADD CONSTRAINT "TopicDuplicateFlag_topicBId_fkey" FOREIGN KEY ("topicBId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicRead" ADD CONSTRAINT "TopicRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicRead" ADD CONSTRAINT "TopicRead_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicFollow" ADD CONSTRAINT "TopicFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicFollow" ADD CONSTRAINT "TopicFollow_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicReminder" ADD CONSTRAINT "TopicReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicReminder" ADD CONSTRAINT "TopicReminder_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicSave" ADD CONSTRAINT "TopicSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicSave" ADD CONSTRAINT "TopicSave_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCoverageRequest" ADD CONSTRAINT "VideoCoverageRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCoverageRequest" ADD CONSTRAINT "VideoCoverageRequest_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMetricSnapshot" ADD CONSTRAINT "TopicMetricSnapshot_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingWeights" ADD CONSTRAINT "RankingWeights_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicFeedback" ADD CONSTRAINT "TopicFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicFeedback" ADD CONSTRAINT "TopicFeedback_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
