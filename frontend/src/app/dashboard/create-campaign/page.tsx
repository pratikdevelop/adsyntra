"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
  CAMPAIGNS_STORAGE_KEY,
  ManagedCampaignRecord,
  readManagedCampaigns,
  writeManagedCampaigns,
} from "../campaigns/_lib/campaigns";
import {
  initialConnection,
  googlePerformanceGoalsByType,
  googleAppGoalOptionsBySubtype,
  metaOptimizationOptions,
  metaBillingOptionsByGoal,
  googleCampaignTypes,
  metaObjectiveMap,
  objectives,
  googleObjectiveFromShared,
  googleMarketingObjectiveOptions,
  googleAppSubtypeOptions,
  metaBuyingTypes,
  metaBidStrategies,
} from "./constant";
import {
  ProviderConnection,
  LibraryAsset,
  CreativeVariation,
  DemoCreationJob,
  ConnectionResponse,
  DemoProviderResult,
  DemoResourceResult,
  GoogleCreativePack,
} from "./interfaces";
import {
  ProviderName,
  Objective,
  GoogleMarketingObjective,
  GoogleEuPoliticalStatus,
  GoogleBiddingMode,
  GooglePerformanceGoal,
  GoogleBudgetMode,
  GoogleBiddingScope,
  GoogleHotelBidStrategy,
  GoogleAppSubtype,
  GoogleAppGoalType,
  MetaBudgetLevel,
  MetaBidStrategy,
  WorkspaceView,
  CampaignPlatformFilter,
  CampaignLifecycleStatus,
  AssetKind,
  CreativeAspectRatio,
  ManagedStatus,
  CampaignExecutionMode,
  PlatformMode,
  CampaignExecutionPayload,
  DemoScenario,
  DemoProviderStatus,
  DemoOverallStatus,
  MetaBuyingType,
} from "./type";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

function normalizeConnection(
  provider?: Partial<ProviderConnection>,
): ProviderConnection {
  return {
    connected: Boolean(provider?.connected),
    accounts: Array.isArray(provider?.accounts) ? provider.accounts : [],
    selectedAccountId:
      typeof provider?.selectedAccountId === "string"
        ? provider.selectedAccountId
        : null,
  };
}

function getAccountRecord(account: unknown): Record<string, unknown> | null {
  return account && typeof account === "object"
    ? (account as Record<string, unknown>)
    : null;
}

function getAccountId(account: unknown): string | null {
  if (typeof account === "string" && account.trim()) return account.trim();
  const item = getAccountRecord(account);
  if (!item) return null;

  const id =
    item.resourceName ??
    item.resource_name ??
    item.customerId ??
    item.customer_id ??
    item.accountId ??
    item.account_id ??
    item.id;

  return id === undefined || id === null || String(id).trim() === ""
    ? null
    : String(id).trim();
}

function getAccountName(account: unknown): string {
  if (typeof account === "string") return account;
  const item = getAccountRecord(account);
  if (!item) return "Advertising account";

  const name =
    item.descriptiveName ??
    item.descriptive_name ??
    item.accountName ??
    item.account_name ??
    item.business_name ??
    item.name;

  return typeof name === "string" && name.trim()
    ? name.trim()
    : getAccountId(account) || "Advertising account";
}

function getAccountCurrency(account: unknown): string | null {
  const item = getAccountRecord(account);
  if (!item) return null;
  const currency = item.currencyCode ?? item.currency_code ?? item.currency;
  return typeof currency === "string" && currency.trim()
    ? currency.trim().toUpperCase()
    : null;
}

function selectedAccount(connection: ProviderConnection): unknown | null {
  return (
    connection.accounts.find(
      (account) => getAccountId(account) === connection.selectedAccountId,
    ) ?? null
  );
}

function selectedAccountLabel(connection: ProviderConnection): string {
  const account = selectedAccount(connection);
  return account
    ? getAccountName(account)
    : connection.selectedAccountId || "No account selected";
}

function selectedCurrency(connection: ProviderConnection): string {
  const account = selectedAccount(connection);
  return getAccountCurrency(account) || "account currency";
}

function isPositiveAmount(value: string): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

export default function CreateCampaignPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [connections, setConnections] = useState({
    googleAds: initialConnection,
    metaAds: initialConnection,
  });
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [selectedPlatforms, setSelectedPlatforms] = useState<ProviderName[]>(
    [],
  );

  // Shared campaign brief.
  const [campaignName, setCampaignName] = useState(
    "Demo - Summer Sale Campaign",
  );
  const [businessName, setBusinessName] = useState("Acme Demo Store");
  const [websiteUrl, setWebsiteUrl] = useState("https://example.com");
  const [description, setDescription] = useState(
    "Promote the summer collection and drive online purchases.",
  );
  const [objective, setObjective] = useState<Objective | "">("SALES");

  // Google Ads settings.
  const [googleCampaignType, setGoogleCampaignType] = useState("SEARCH");
  const [googleMarketingObjective, setGoogleMarketingObjective] =
    useState<GoogleMarketingObjective>("SALES");
  const [googleEuPoliticalStatus, setGoogleEuPoliticalStatus] =
    useState<GoogleEuPoliticalStatus>(
      "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    );
  const [googleBiddingMode, setGoogleBiddingMode] =
    useState<GoogleBiddingMode>("AUTOMATED");
  const [googlePerformanceGoal, setGooglePerformanceGoal] =
    useState<GooglePerformanceGoal>("CONVERSIONS");
  const [googleBudgetMode, setGoogleBudgetMode] =
    useState<GoogleBudgetMode>("DAILY");
  const [googleDailyBudget, setGoogleDailyBudget] = useState("1500");
  const [googleCampaignTotalBudget, setGoogleCampaignTotalBudget] =
    useState("15000");
  const [googleBiddingScope, setGoogleBiddingScope] =
    useState<GoogleBiddingScope>("STANDARD");
  const [
    googlePortfolioStrategyResourceName,
    setGooglePortfolioStrategyResourceName,
  ] = useState("customers/1234567890/biddingStrategies/123456789");
  const [googleStartDate, setGoogleStartDate] = useState("2026-11-05");
  const [googleEndDate, setGoogleEndDate] = useState("2026-12-05");
  const [googleGeoTargetResources, setGoogleGeoTargetResources] = useState(
    "geoTargetConstants/2356",
  );
  const [googleLanguageResources, setGoogleLanguageResources] = useState("");
  const [googleTargetCpa, setGoogleTargetCpa] = useState("500");
  const [googleTargetRoas, setGoogleTargetRoas] = useState("3.0");
  const [
    googleCustomConversionGoalResourceName,
    setGoogleCustomConversionGoalResourceName,
  ] = useState("customers/1234567890/customConversionGoals/123456789");
  const [googleImpressionSharePercent, setGoogleImpressionSharePercent] =
    useState("80");
  const [googleImpressionShareLocation, setGoogleImpressionShareLocation] =
    useState("TOP_OF_PAGE");
  const [googleImpressionShareMaxCpc, setGoogleImpressionShareMaxCpc] =
    useState("100");
  const [googleSearchPartners, setGoogleSearchPartners] = useState(false);
  const [googleDisplayExpansion, setGoogleDisplayExpansion] = useState(false);
  const [googleHotelCenterId, setGoogleHotelCenterId] = useState("123456789");
  const [googleHotelBidStrategy, setGoogleHotelBidStrategy] =
    useState<GoogleHotelBidStrategy>("PERCENT_CPC");
  const [googleHotelBidCeiling, setGoogleHotelBidCeiling] = useState("25");
  const [googleHotelAdGroupName, setGoogleHotelAdGroupName] =
    useState("Hotel Ad Group");
  const [googleHotelTargetCountry, setGoogleHotelTargetCountry] =
    useState("US");
  const [googleHotelLanguage, setGoogleHotelLanguage] = useState("en");
  const [googleHotelListingMode, setGoogleHotelListingMode] = useState<
    "ALL_HOTELS" | "SELECTED_HOTELS"
  >("ALL_HOTELS");
  const [googleHotelPropertyIds, setGoogleHotelPropertyIds] =
    useState("DEMO_HOTEL_001");
  const [googleMerchantCenterId, setGoogleMerchantCenterId] =
    useState("123456789");
  const [googleShoppingPriority, setGoogleShoppingPriority] = useState("0");
  const [googleShoppingFeedLabel, setGoogleShoppingFeedLabel] =
    useState("DEMO_FEED");
  const [googleShoppingProductGroupType, setGoogleShoppingProductGroupType] =
    useState("ALL_PRODUCTS");
  const [googleShoppingProductGroupValue, setGoogleShoppingProductGroupValue] =
    useState("DEMO_CATEGORY");
  const [demandGenChannels, setDemandGenChannels] = useState({
    youtube_in_feed: true,
    youtube_in_stream: true,
    youtube_shorts: true,
    discover: true,
    gmail: true,
    display: false,
    maps: false,
  });
  const [googleAppSubtype, setGoogleAppSubtype] =
    useState<GoogleAppSubtype>("APP_CAMPAIGN");
  const [googleAppGoalType, setGoogleAppGoalType] = useState<GoogleAppGoalType>(
    "OPTIMIZE_INSTALLS_WITHOUT_TARGET_INSTALL_COST",
  );
  const [googleAppId, setGoogleAppId] = useState("com.example.demostore");
  const [googleAppStore, setGoogleAppStore] = useState("GOOGLE_APP_STORE");
  const [googleAppTargetCost, setGoogleAppTargetCost] = useState("75");
  const [googleAppTargetRoas, setGoogleAppTargetRoas] = useState("2.5");
  const [googleAppHeadlines, setGoogleAppHeadlines] = useState(
    "Shop the Demo App\nDiscover New Arrivals\nSimple Online Shopping",
  );
  const [googleAppDescriptions, setGoogleAppDescriptions] = useState(
    "Browse products and exclusive app offers.\nEnjoy a simple and convenient shopping experience.",
  );
  const [googleAppImageUrls, setGoogleAppImageUrls] = useState(
    "https://example.com/app-image-1.jpg\nhttps://example.com/app-image-2.jpg",
  );
  const [googleAppYoutubeVideoIds, setGoogleAppYoutubeVideoIds] =
    useState("DEMO_VIDEO_ID_123");
  const [
    googleAppEngagementAudienceResource,
    setGoogleAppEngagementAudienceResource,
  ] = useState("customers/1234567890/audiences/123456789");
  const [
    googleAppSelectiveConversionActions,
    setGoogleAppSelectiveConversionActions,
  ] = useState("customers/1234567890/conversionActions/123456789");

  // Meta Ads settings.
  const [metaBuyingType, setMetaBuyingType] =
    useState<MetaBuyingType>("AUCTION");
  const [metaBudgetLevel, setMetaBudgetLevel] =
    useState<MetaBudgetLevel>("CAMPAIGN");
  const [metaBudgetMode, setMetaBudgetMode] = useState<"DAILY" | "LIFETIME">(
    "DAILY",
  );
  const [metaDailyBudget, setMetaDailyBudget] = useState("1200");
  const [metaLifetimeBudget, setMetaLifetimeBudget] = useState("25000");
  const [metaStartTime, setMetaStartTime] = useState("2026-11-05T09:00");
  const [metaEndTime, setMetaEndTime] = useState("2026-12-05T18:00");
  const [metaOptimizationGoal, setMetaOptimizationGoal] = useState(
    "OFFSITE_CONVERSIONS",
  );
  const [metaBillingEvent, setMetaBillingEvent] = useState("IMPRESSIONS");
  const [metaBidStrategy, setMetaBidStrategy] = useState<MetaBidStrategy>(
    "LOWEST_COST_WITHOUT_CAP",
  );
  const [metaBidAmount, setMetaBidAmount] = useState("150");
  const [metaMinimumRoas, setMetaMinimumRoas] = useState("2.0");
  const [metaCountries, setMetaCountries] = useState("IN");
  const [metaRegionKeys, setMetaRegionKeys] = useState("123456789");
  const [metaCityKeys, setMetaCityKeys] = useState("987654321");
  const [metaZipKeys, setMetaZipKeys] = useState("IN:452001");
  const [metaCityRadius, setMetaCityRadius] = useState("25");
  const [metaCityDistanceUnit, setMetaCityDistanceUnit] = useState<
    "kilometer" | "mile"
  >("kilometer");
  const [metaAgeMin, setMetaAgeMin] = useState("18");
  const [metaAgeMax, setMetaAgeMax] = useState("65");
  const [metaGender, setMetaGender] = useState<"ALL" | "MEN" | "WOMEN">("ALL");
  const [metaSpecialAdCategories, setMetaSpecialAdCategories] = useState<
    string[]
  >([]);
  const [metaPlacementMode, setMetaPlacementMode] = useState<
    "AUTOMATIC" | "MANUAL"
  >("AUTOMATIC");
  const [metaPublisherPlatforms, setMetaPublisherPlatforms] = useState<
    string[]
  >(["facebook", "instagram", "messenger", "audience_network"]);
  const [metaFacebookPositions, setMetaFacebookPositions] = useState<string[]>([
    "feed",
    "story",
    "reels",
  ]);
  const [metaInstagramPositions, setMetaInstagramPositions] = useState<
    string[]
  >(["stream", "story", "reels", "explore"]);
  const [metaMessengerPositions, setMetaMessengerPositions] = useState<
    string[]
  >(["messenger_home", "sponsored_messages"]);
  const [metaAudienceNetworkPositions, setMetaAudienceNetworkPositions] =
    useState<string[]>(["classic", "rewarded_video"]);
  const [metaAudienceInterestIds, setMetaAudienceInterestIds] =
    useState("600000000000001");
  const [metaIncludedCustomAudienceIds, setMetaIncludedCustomAudienceIds] =
    useState("600000000000002");
  const [metaExcludedCustomAudienceIds, setMetaExcludedCustomAudienceIds] =
    useState("600000000000003");

  // Google child structure: standard Ad Group or Performance Max Asset Group.
  const [googleAdGroupName, setGoogleAdGroupName] = useState("Main Ad Group");
  const [googleKeywordLines, setGoogleKeywordLines] = useState(
    "online shopping\nsummer sale\nbuy quality products\nnew season collection",
  );
  const [googleNegativeKeywordLines, setGoogleNegativeKeywordLines] = useState(
    "free\nused\nwholesale",
  );
  const [googleKeywordMatchType, setGoogleKeywordMatchType] =
    useState("PHRASE");
  const [googleDefaultCpcBid, setGoogleDefaultCpcBid] = useState("20");
  const [pmaxAssetGroupName, setPmaxAssetGroupName] =
    useState("Main Asset Group");
  const [pmaxFinalUrl, setPmaxFinalUrl] = useState(
    "https://example.com/summer-collection",
  );
  const [pmaxHeadlines, setPmaxHeadlines] = useState(
    "Summer Sale Is Here\nShop New Arrivals\nGreat Finds Online\nExplore The Collection\nUpgrade Your Style",
  );
  const [pmaxLongHeadline, setPmaxLongHeadline] = useState(
    "Discover the latest collection and shop special summer offers online",
  );
  const [pmaxDescriptions, setPmaxDescriptions] = useState(
    "Explore quality products for every day.\nFind new arrivals and seasonal favourites.\nShop online with convenient delivery.",
  );
  const [pmaxBusinessName, setPmaxBusinessName] = useState("Acme Demo Store");
  const [pmaxPortraitImageUrl, setPmaxPortraitImageUrl] = useState(
    "https://example.com/pmax-portrait.jpg",
  );
  const [pmaxYoutubeVideoIds, setPmaxYoutubeVideoIds] = useState(
    "DEMO_YOUTUBE_VIDEO_ID",
  );
  const [pmaxLogoUrl, setPmaxLogoUrl] = useState(
    "https://example.com/brand-logo.png",
  );
  const [pmaxLandscapeImageUrl, setPmaxLandscapeImageUrl] = useState(
    "https://example.com/pmax-landscape.jpg",
  );
  const [pmaxSquareImageUrl, setPmaxSquareImageUrl] = useState(
    "https://example.com/pmax-square.jpg",
  );
  const [pmaxSearchThemes, setPmaxSearchThemes] = useState(
    "summer shopping\nonline fashion store\nseasonal offers",
  );
  const [pmaxAudienceResourceNames, setPmaxAudienceResourceNames] = useState(
    "customers/1234567890/audiences/123456789",
  );
  const [googleAdGroupUserLists, setGoogleAdGroupUserLists] = useState(
    "customers/1234567890/userLists/123456789",
  );
  const [
    googleDemandGenAudienceResources,
    setGoogleDemandGenAudienceResources,
  ] = useState("customers/1234567890/audiences/123456789");

  // Meta child structure: Ad Set and a starter link-ad creative draft.
  const [metaAdSetName, setMetaAdSetName] = useState("Main Ad Set");
  const [metaPageId, setMetaPageId] = useState("123456789012345");
  const [metaInstagramActorId, setMetaInstagramActorId] =
    useState("123456789012345");
  const [metaPixelId, setMetaPixelId] = useState("123456789012345");
  const [metaConversionEvent, setMetaConversionEvent] = useState("PURCHASE");
  const [metaPrimaryText, setMetaPrimaryText] = useState(
    "Discover the latest collection from Acme Demo Store. Shop seasonal favourites and find something you love.",
  );
  const [metaAdHeadline, setMetaAdHeadline] = useState(
    "Explore the Summer Collection",
  );
  const [metaAdDescription, setMetaAdDescription] = useState(
    "New arrivals and seasonal offers.",
  );
  const [metaCreativeImageUrl, setMetaCreativeImageUrl] = useState(
    "https://example.com/meta-ad-image.jpg",
  );
  const [metaCreativeFormat, setMetaCreativeFormat] = useState<
    "SINGLE_IMAGE" | "SINGLE_VIDEO" | "CAROUSEL"
  >("SINGLE_IMAGE");
  const [metaCreativeVideoId, setMetaCreativeVideoId] =
    useState("DEMO_META_VIDEO_ID");
  const [metaCarouselCards, setMetaCarouselCards] = useState(
    "New Arrivals | https://example.com/card-1.jpg | https://example.com/collection\nSummer Offers | https://example.com/card-2.jpg | https://example.com/offers",
  );
  const [metaDestinationType, setMetaDestinationType] = useState<
    "WEBSITE" | "INSTANT_FORM" | "MESSAGING" | "APP"
  >("WEBSITE");
  const [metaInstantFormId, setMetaInstantFormId] = useState("123456789012345");
  const [metaMessagingDestinationId, setMetaMessagingDestinationId] =
    useState("123456789012345");
  const [metaAppId, setMetaAppId] = useState("com.example.demostore");
  const [metaAppStoreUrl, setMetaAppStoreUrl] = useState(
    "https://example.com/app",
  );
  const [metaMessagingType, setMetaMessagingType] = useState<
    "MESSENGER" | "INSTAGRAM_DIRECT" | "WHATSAPP"
  >("MESSENGER");
  const [metaDestinationUrl, setMetaDestinationUrl] = useState(
    "https://example.com/summer-collection",
  );
  const [metaCallToAction, setMetaCallToAction] = useState("LEARN_MORE");

  // Google ad drafts are collected after the campaign's Ad Group / Asset Group.
  const [googleSearchFinalUrl, setGoogleSearchFinalUrl] = useState(
    "https://example.com",
  );
  const [googleSearchHeadlines, setGoogleSearchHeadlines] = useState(
    "Shop Quality Products\nSummer Sale Is Here\nFast Delivery Available",
  );
  const [googleSearchDescriptions, setGoogleSearchDescriptions] = useState(
    "Discover quality products at great prices. Browse the latest collection online.\nShop today and enjoy convenient delivery on eligible orders.",
  );
  const [googleSearchPath1, setGoogleSearchPath1] = useState("summer-sale");
  const [googleSearchPath2, setGoogleSearchPath2] = useState("shop-online");
  const [googleDisplayFinalUrl, setGoogleDisplayFinalUrl] = useState(
    "https://example.com",
  );
  const [googleDisplayHeadlines, setGoogleDisplayHeadlines] = useState(
    "Discover New Arrivals\nSummer Sale Today",
  );
  const [googleDisplayDescriptions, setGoogleDisplayDescriptions] = useState(
    "Explore quality products for every day.\nShop the latest collection with convenient delivery.",
  );
  const [googleDisplayImageUrl, setGoogleDisplayImageUrl] = useState(
    "https://example.com/image.jpg",
  );
  const [googleDisplaySquareImageUrl, setGoogleDisplaySquareImageUrl] =
    useState("https://example.com/square-image.jpg");
  const [googleDisplayLongHeadline, setGoogleDisplayLongHeadline] = useState(
    "Discover great products in our summer collection",
  );
  const [googleDisplayBusinessName, setGoogleDisplayBusinessName] =
    useState("Acme Demo Store");
  const [googleDemandGenFormat, setGoogleDemandGenFormat] = useState<
    "MULTI_ASSET" | "VIDEO_RESPONSIVE" | "CAROUSEL" | "PRODUCT_FEED"
  >("MULTI_ASSET");
  const [googleDemandGenProductHeadline, setGoogleDemandGenProductHeadline] =
    useState("Shop the Summer Collection");
  const [
    googleDemandGenProductDescription,
    setGoogleDemandGenProductDescription,
  ] = useState("Discover seasonal favourites and new arrivals online.");
  const [googleDemandGenProductLogoUrl, setGoogleDemandGenProductLogoUrl] =
    useState("https://example.com/logo.png");
  const [googleDemandGenProductGroupMode, setGoogleDemandGenProductGroupMode] =
    useState<"ALL_PRODUCTS" | "SELECTED_PRODUCTS">("ALL_PRODUCTS");
  const [googleDemandGenLogoUrl, setGoogleDemandGenLogoUrl] = useState(
    "https://example.com/logo.png",
  );
  const [googleDemandGenVideoIds, setGoogleDemandGenVideoIds] = useState(
    "DEMO_YOUTUBE_VIDEO_ID",
  );
  const [googleDemandGenCarouselCards, setGoogleDemandGenCarouselCards] =
    useState(
      "New Arrivals | https://example.com/dg-card-1.jpg | https://example.com/new-arrivals\nSummer Offers | https://example.com/dg-card-2.jpg | https://example.com/offers",
    );

  // Prototype workspace modules. These remain local mock data until backend APIs exist.
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("builder");
  const [campaignRecords, setCampaignRecords] = useState<
    ManagedCampaignRecord[]
  >(() => [
    {
      id: "DEMO-CMP-001-GOOGLE",
      groupId: "DEMO-GROUP-001",
      name: "Summer Search | Website Sales",
      provider: "googleAds",
      campaignType: "Google Search",
      googleCampaignType: "SEARCH",
      objective: "SALES",
      budgetLabel: "₹1,500 / day",
      status: "ACTIVE",
      creationStatus: "SUCCESS",
      accountLabel: "Demo Google Ads account",
      createdAt: "Nov 01, 2026",
      updatedAt: "Nov 03, 2026 · 10:15 AM",
      source: "SAMPLE",
    },
    {
      id: "DEMO-CMP-002-META",
      groupId: "DEMO-GROUP-002",
      name: "New Arrivals | Instagram & Facebook",
      provider: "metaAds",
      campaignType: "Meta Auction",
      objective: "SALES",
      budgetLabel: "₹1,200 / day",
      status: "ACTIVE",
      creationStatus: "SUCCESS",
      accountLabel: "Demo Meta ad account",
      createdAt: "Oct 29, 2026",
      updatedAt: "Nov 03, 2026 · 09:40 AM",
      source: "SAMPLE",
    },
    {
      id: "DEMO-CMP-003-GOOGLE",
      groupId: "DEMO-GROUP-003",
      name: "Brand Awareness | Google + Meta",
      provider: "googleAds",
      campaignType: "Google Display",
      googleCampaignType: "DISPLAY",
      objective: "AWARENESS",
      budgetLabel: "₹1,000 / day",
      status: "PAUSED",
      creationStatus: "SUCCESS",
      accountLabel: "Demo Google Ads account",
      createdAt: "Oct 25, 2026",
      updatedAt: "Nov 02, 2026 · 04:20 PM",
      source: "SAMPLE",
    },
    {
      id: "DEMO-CMP-003-META",
      groupId: "DEMO-GROUP-003",
      name: "Brand Awareness | Google + Meta",
      provider: "metaAds",
      campaignType: "Meta Auction",
      objective: "AWARENESS",
      budgetLabel: "₹800 / day",
      status: "PAUSED",
      creationStatus: "PARTIAL_SUCCESS",
      accountLabel: "Demo Meta ad account",
      createdAt: "Oct 25, 2026",
      updatedAt: "Nov 02, 2026 · 04:20 PM",
      source: "SAMPLE",
    },
    {
      id: "DEMO-CMP-004-GOOGLE",
      groupId: "DEMO-GROUP-004",
      name: "Performance Max | Winter Catalogue",
      provider: "googleAds",
      campaignType: "Google Performance Max",
      googleCampaignType: "PERFORMANCE_MAX",
      objective: "SALES",
      budgetLabel: "₹2,000 / day",
      status: "FAILED",
      creationStatus: "FAILED",
      accountLabel: "Demo Google Ads account",
      createdAt: "Oct 22, 2026",
      updatedAt: "Oct 22, 2026 · 02:10 PM",
      source: "SAMPLE",
    },
  ]);
  const [campaignRecordsLoaded, setCampaignRecordsLoaded] = useState(false);

  // Keep campaign records shared with /dashboard/campaigns. The browser store
  // is prototype persistence only; it is not a provider database.
  useEffect(() => {
    const savedRecords = readManagedCampaigns();
    if (savedRecords.length > 0) {
      setCampaignRecords(savedRecords as ManagedCampaignRecord[]);
    }
    setCampaignRecordsLoaded(true);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CAMPAIGNS_STORAGE_KEY) return;
      setCampaignRecords(readManagedCampaigns() as ManagedCampaignRecord[]);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!campaignRecordsLoaded) return;
    writeManagedCampaigns(campaignRecords);
  }, [campaignRecords, campaignRecordsLoaded]);

  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignPlatformFilter, setCampaignPlatformFilter] =
    useState<CampaignPlatformFilter>("ALL");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<
    CampaignLifecycleStatus | "ALL"
  >("ALL");
  const [selectedCampaignId, setSelectedCampaignId] = useState("DEMO-CMP-001");
  const [campaignNotice, setCampaignNotice] = useState("");
  const [assetLibrary, setAssetLibrary] = useState<LibraryAsset[]>(() => [
    {
      id: "DEMO-ASSET-001",
      name: "Summer Collection Hero",
      kind: "IMAGE",
      url: "https://example.com/summer-hero.jpg",
      addedAt: "Demo data",
    },
    {
      id: "DEMO-ASSET-002",
      name: "Acme Brand Logo",
      kind: "LOGO",
      url: "https://example.com/acme-logo.png",
      addedAt: "Demo data",
    },
    {
      id: "DEMO-ASSET-003",
      name: "Summer Promo Video",
      kind: "VIDEO",
      url: "https://example.com/summer-promo.mp4",
      addedAt: "Demo data",
    },
  ]);
  const [newAssetName, setNewAssetName] = useState("New Asset");
  const [newAssetKind, setNewAssetKind] = useState<AssetKind>("IMAGE");
  const [newAssetUrl, setNewAssetUrl] = useState(
    "https://example.com/image.jpg",
  );
  const [assetNotice, setAssetNotice] = useState("no notice");
  const [creativePrompt, setCreativePrompt] = useState(
    "Create a premium summer campaign visual for Acme Demo Store featuring the new collection, warm sunlight, clean product styling and a confident shopping message.",
  );
  const [creativeKind, setCreativeKind] = useState<"IMAGE" | "VIDEO">("IMAGE");
  const [creativeAspectRatio, setCreativeAspectRatio] =
    useState<CreativeAspectRatio>("1:1");
  const [googleCreativeAspectRatio, setGoogleCreativeAspectRatio] =
    useState<CreativeAspectRatio>("1.91:1");
  const [creativeStyle, setCreativeStyle] = useState("Premium lifestyle");
  const [creativeVariations, setCreativeVariations] = useState<
    CreativeVariation[]
  >([]);
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(
    null,
  );
  const [attachedCreativeAssetIds, setAttachedCreativeAssetIds] = useState<
    string[]
  >([]);
  const [creativeStudioNotice, setCreativeStudioNotice] = useState("");
  const [managedStatuses, setManagedStatuses] = useState<
    Record<string, ManagedStatus>
  >({});
  const [duplicatedDrafts, setDuplicatedDrafts] = useState<string[]>([]);
  const [savedDraft, setSavedDraft] = useState<{
    name: string;
    savedAt: string;
    step: number;
  } | null>(null);

  const [preparedPayload, setPreparedPayload] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [demoJob, setDemoJob] = useState<DemoCreationJob | null>(null);
  const [executionMode, setExecutionMode] =
    useState<CampaignExecutionMode>("VALIDATE_ONLY");
  const [campaignSubmitting, setCampaignSubmitting] = useState(false);

  const [campaignApiResponse, setCampaignApiResponse] = useState<unknown>(null);

  const [campaignApiError, setCampaignApiError] = useState("");

  const [apiPayloadPreview, setApiPayloadPreview] = useState("");

  const googleReady =
    connections.googleAds.connected &&
    Boolean(connections.googleAds.selectedAccountId);
  const metaReady =
    connections.metaAds.connected &&
    Boolean(connections.metaAds.selectedAccountId);
  const bothReady = googleReady && metaReady;

  const platformMode: PlatformMode | "none" = useMemo(() => {
    if (selectedPlatforms.length === 2) return "both";
    if (selectedPlatforms[0]) return selectedPlatforms[0];
    return "none";
  }, [selectedPlatforms]);

  const googleSupportsCampaignTotalBudget = [
    "SEARCH",
    "PERFORMANCE_MAX",
    "DEMAND_GEN",
    "SHOPPING",
  ].includes(googleCampaignType);
  const effectiveGoogleBudgetMode: GoogleBudgetMode =
    googleSupportsCampaignTotalBudget && googleBudgetMode === "CAMPAIGN_TOTAL"
      ? "CAMPAIGN_TOTAL"
      : "DAILY";
  const googlePortfolioStrategyEligible = [
    "SEARCH",
    "PERFORMANCE_MAX",
    "SHOPPING",
  ].includes(googleCampaignType);
  const effectiveGoogleBiddingScope: GoogleBiddingScope =
    googlePortfolioStrategyEligible && googleBiddingScope === "PORTFOLIO"
      ? "PORTFOLIO"
      : "STANDARD";

  const availableGooglePerformanceGoals =
    googleCampaignType === "APP"
      ? []
      : googlePerformanceGoalsByType[googleCampaignType] ||
        googlePerformanceGoalsByType.SEARCH;
  const effectiveGooglePerformanceGoal = availableGooglePerformanceGoals.some(
    (item) => item.value === googlePerformanceGoal,
  )
    ? googlePerformanceGoal
    : availableGooglePerformanceGoals[0]?.value || "CONVERSIONS";
  const selectedGooglePerformanceConfig =
    availableGooglePerformanceGoals.find(
      (item) => item.value === effectiveGooglePerformanceGoal,
    ) || null;
  const availableGoogleBiddingModes: GoogleBiddingMode[] =
    googleCampaignType === "SEARCH"
      ? ["AUTOMATED", "MANUAL_CPC"]
      : googleCampaignType === "DISPLAY"
        ? ["AUTOMATED", "MANUAL_CPC", "MANUAL_CPM"]
        : ["AUTOMATED"];
  const effectiveGoogleBiddingMode = availableGoogleBiddingModes.includes(
    googleBiddingMode,
  )
    ? googleBiddingMode
    : "AUTOMATED";
  const effectiveGoogleBiddingStrategy =
    effectiveGoogleBiddingMode === "MANUAL_CPC"
      ? "MANUAL_CPC"
      : effectiveGoogleBiddingMode === "MANUAL_CPM"
        ? "MANUAL_CPM"
        : selectedGooglePerformanceConfig?.biddingStrategy ||
          "MAXIMIZE_CONVERSIONS";
  const availableGoogleAppGoals =
    googleAppGoalOptionsBySubtype[googleAppSubtype];
  const effectiveGoogleAppGoal = availableGoogleAppGoals.some(
    (item) => item.value === googleAppGoalType,
  )
    ? googleAppGoalType
    : availableGoogleAppGoals[0].value;
  const selectedGoogleAppGoal = availableGoogleAppGoals.find(
    (item) => item.value === effectiveGoogleAppGoal,
  )!;

  const availableMetaOptimizationOptions = objective
    ? metaOptimizationOptions[objective]
    : [];
  const effectiveMetaOptimizationGoal = availableMetaOptimizationOptions.some(
    (item) => item.value === metaOptimizationGoal,
  )
    ? metaOptimizationGoal
    : availableMetaOptimizationOptions[0]?.value || "";
  const availableMetaBillingOptions =
    metaBillingOptionsByGoal[effectiveMetaOptimizationGoal] ||
    metaBillingOptionsByGoal.DEFAULT;
  const effectiveMetaBillingEvent = availableMetaBillingOptions.some(
    (item) => item.value === metaBillingEvent,
  )
    ? metaBillingEvent
    : availableMetaBillingOptions[0]?.value || "IMPRESSIONS";

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setLoadingConnections(false);
      setConnectionError("Please sign in to continue.");
      return;
    }

    let cancelled = false;

    const loadConnections = async () => {
      try {
        setLoadingConnections(true);
        setConnectionError("");
        const token = await getToken();
        if (!token) throw new Error("Unable to get authentication token.");

        const response = await fetch(`${API_BASE_URL}/api/connections/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data: ConnectionResponse = await response.json();
        if (!response.ok) {
          throw new Error(
            data.message || "Failed to load advertising accounts.",
          );
        }
        if (cancelled) return;

        const google = normalizeConnection(data.providers?.googleAds);
        const meta = normalizeConnection(data.providers?.metaAds);
        setConnections({ googleAds: google, metaAds: meta });

        const available: ProviderName[] = [];
        if (google.connected && google.selectedAccountId)
          available.push("googleAds");
        if (meta.connected && meta.selectedAccountId) available.push("metaAds");
        setSelectedPlatforms(available);
      } catch (err) {
        if (!cancelled) {
          setConnectionError(
            err instanceof Error ? err.message : "Unable to load connections.",
          );
        }
      } finally {
        if (!cancelled) setLoadingConnections(false);
      }
    };

    void loadConnections();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  const clearPreview = () => {
    setPreparedPayload("");
    setApiPayloadPreview("");
    setCopyNotice("");

    setCampaignApiResponse(null);
    setCampaignApiError("");
  };

  const choosePlatformMode = (mode: PlatformMode) => {
    setError("");
    clearPreview();
    if (mode === "both") {
      setSelectedPlatforms([
        ...(googleReady ? (["googleAds"] as const) : []),
        ...(metaReady ? (["metaAds"] as const) : []),
      ]);
      return;
    }
    setSelectedPlatforms(
      mode === "googleAds"
        ? googleReady
          ? ["googleAds"]
          : []
        : metaReady
          ? ["metaAds"]
          : [],
    );
  };

  const validateBasics = () => {
    if (!selectedPlatforms.length) {
      setError("Select Google Ads, Meta Ads, or both connected platforms.");
      return false;
    }
    if (
      selectedPlatforms.some(
        (provider) => !connections[provider].selectedAccountId,
      )
    ) {
      setError(
        "Select an active advertising account for every chosen platform.",
      );
      return false;
    }
    if (!campaignName.trim()) {
      setError("Enter a campaign name.");
      return false;
    }
    if (!businessName.trim()) {
      setError("Enter your business name.");
      return false;
    }
    if (!objective) {
      setError("Select a campaign objective.");
      return false;
    }
    if (websiteUrl.trim()) {
      try {
        const parsed = new URL(websiteUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        setError("Enter a valid website URL, including https://.");
        return false;
      }
    }
    setError("");
    return true;
  };

  const geoResources = googleGeoTargetResources
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const languageResources = googleLanguageResources
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);

  const validatePlatformSettings = () => {
    if (
      selectedPlatforms.includes("googleAds") &&
      effectiveGoogleBudgetMode === "DAILY" &&
      !isPositiveAmount(googleDailyBudget)
    ) {
      setError("Enter a Google Ads average daily budget greater than zero.");
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
    ) {
      if (!isPositiveAmount(googleCampaignTotalBudget)) {
        setError("Enter a Google Ads campaign total budget greater than zero.");
        return false;
      }
      if (
        !googleStartDate ||
        !googleEndDate ||
        googleEndDate <= googleStartDate
      ) {
        setError(
          "Google campaign total budgets require a start date and an end date later than the start date.",
        );
        return false;
      }
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleBiddingScope === "PORTFOLIO"
    ) {
      if (
        !googlePortfolioStrategyEligible ||
        effectiveGoogleBiddingMode !== "AUTOMATED"
      ) {
        setError(
          "Portfolio bidding is only offered here for automated Search, Shopping and Performance Max workflows. Verify the selected portfolio strategy type is compatible with this campaign.",
        );
        return false;
      }
      if (
        !/^customers\/\d+\/biddingStrategies\/\d+$/.test(
          googlePortfolioStrategyResourceName.trim(),
        )
      ) {
        setError(
          "Enter an existing Google portfolio bidding strategy resource name, such as customers/123456/biddingStrategies/789.",
        );
        return false;
      }
    }
    if (selectedPlatforms.includes("googleAds") && !googleEuPoliticalStatus) {
      setError(
        "Declare whether the Google campaign contains EU political advertising.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCustomConversionGoalResourceName.trim() &&
      !/^customers\/\d+\/customConversionGoals\/\d+$/.test(
        googleCustomConversionGoalResourceName.trim(),
      )
    ) {
      setError(
        "Enter a valid Google Custom Conversion Goal resource name, such as customers/123456/customConversionGoals/789.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleStartDate &&
      googleEndDate &&
      googleEndDate <= googleStartDate
    ) {
      setError("Google campaign end date must be later than its start date.");
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      (geoResources.some((v) => !/^geoTargetConstants\/\d+$/.test(v)) ||
        languageResources.some((v) => !/^languageConstants\/\d+$/.test(v)))
    ) {
      setError(
        "Use Google resource names: geoTargetConstants/ID and languageConstants/ID.",
      );
      return false;
    }
    const adGroupUserLists = googleAdGroupUserLists
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    const pmaxAudienceNames = pmaxAudienceResourceNames
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    const demandGenAudienceNames = googleDemandGenAudienceResources
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (
      selectedPlatforms.includes("googleAds") &&
      adGroupUserLists.some(
        (v) =>
          !/^customers\/\d+\/userLists\/\d+$/.test(v) &&
          !/^userLists\/\d+$/.test(v),
      )
    ) {
      setError(
        "Google remarketing lists must use user-list resource names such as customers/123/userLists/456.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      [...pmaxAudienceNames, ...demandGenAudienceNames].some(
        (v) => !/^customers\/\d+\/audiences\/\d+$/.test(v),
      )
    ) {
      setError(
        "Performance Max and Demand Gen audience signals must use Audience resource names such as customers/123/audiences/456.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleMarketingObjective === "LOCAL_STORES_VISITS" &&
      googleCampaignType !== "PERFORMANCE_MAX"
    ) {
      setError(
        "Google local store visit goals should use Performance Max in this builder. Select Performance Max and ensure eligible store/location assets and conversion goals are configured.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType === "SHOPPING"
    ) {
      if (!/^\d+$/.test(googleMerchantCenterId.trim())) {
        setError(
          "Enter the numeric Merchant Center account ID linked to Google Ads.",
        );
        return false;
      }
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType === "DEMAND_GEN" &&
      !Object.values(demandGenChannels).some(Boolean)
    ) {
      setError("Select at least one Demand Gen channel.");
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType === "HOTEL"
    ) {
      if (!/^\d+$/.test(googleHotelCenterId.trim())) {
        setError(
          "Enter the numeric Hotel Center account ID linked to this Google Ads account.",
        );
        return false;
      }
      if (!isPositiveAmount(googleHotelBidCeiling)) {
        setError("Enter a positive Hotel CPC bid ceiling.");
        return false;
      }
      if (!googleHotelAdGroupName.trim()) {
        setError("Enter a Hotel Ad Group name.");
        return false;
      }
      if (!googleHotelTargetCountry.trim() || !googleHotelLanguage.trim()) {
        setError(
          "Choose a target country and language for the Hotel campaign.",
        );
        return false;
      }
      if (
        googleHotelListingMode === "SELECTED_HOTELS" &&
        !googleHotelPropertyIds
          .split(/[\n,]+/)
          .map((v) => v.trim())
          .filter(Boolean).length
      ) {
        setError(
          "Enter at least one Hotel Center property ID, or choose All hotels.",
        );
        return false;
      }
    } else if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType === "APP"
    ) {
      if (!googleAppId.trim()) {
        setError("Enter the Google Play package name or App Store app ID.");
        return false;
      }
      if (
        googleAppSubtype === "APP_CAMPAIGN_FOR_PRE_REGISTRATION" &&
        googleAppStore !== "GOOGLE_APP_STORE"
      ) {
        setError(
          "App pre-registration is available for Google Play apps; select Google Play Store.",
        );
        return false;
      }
      if (googleAppSubtype === "APP_CAMPAIGN_FOR_ENGAGEMENT") {
        if (
          !/^customers\/\d+\/audiences\/\d+$/.test(
            googleAppEngagementAudienceResource.trim(),
          )
        ) {
          setError(
            "App engagement requires an existing Google Audience resource name, such as customers/123456/audiences/789. Include the app-user list segment in that Audience.",
          );
          return false;
        }
        const actionNames = googleAppSelectiveConversionActions
          .split(/[\n,]+/)
          .map((v) => v.trim())
          .filter(Boolean);
        if (
          !actionNames.length ||
          actionNames.some(
            (v) => !/^customers\/\d+\/conversionActions\/\d+$/.test(v),
          )
        ) {
          setError(
            "Add at least one eligible conversion action resource, such as customers/123456/conversionActions/789.",
          );
          return false;
        }
      }
      if (
        selectedGoogleAppGoal?.targetKind === "CPA" &&
        !isPositiveAmount(googleAppTargetCost)
      ) {
        setError(
          "Enter the target CPA / CPI required by the selected App campaign goal.",
        );
        return false;
      }
      if (
        selectedGoogleAppGoal?.targetKind === "ROAS" &&
        !isPositiveAmount(googleAppTargetRoas)
      ) {
        setError("Enter a positive target ROAS (for example, 3.0 for 300%).");
        return false;
      }
    } else if (
      selectedPlatforms.includes("googleAds") &&
      !selectedGooglePerformanceConfig
    ) {
      setError(
        "Choose a performance goal supported by the selected Google campaign type.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType === "SEARCH" &&
      effectiveGooglePerformanceGoal === "IMPRESSION_SHARE" &&
      effectiveGoogleBiddingMode === "AUTOMATED"
    ) {
      const share = Number(googleImpressionSharePercent);
      if (
        !Number.isFinite(share) ||
        share < 1 ||
        share > 100 ||
        !isPositiveAmount(googleImpressionShareMaxCpc)
      ) {
        setError(
          "For Target Impression Share, enter a target between 1 and 100 and a positive maximum CPC bid ceiling.",
        );
        return false;
      }
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      ["SEARCH", "PERFORMANCE_MAX"].includes(googleCampaignType) &&
      effectiveGooglePerformanceGoal === "CONVERSIONS" &&
      effectiveGoogleBiddingMode === "AUTOMATED" &&
      googleTargetCpa &&
      !isPositiveAmount(googleTargetCpa)
    ) {
      setError("Target CPA must be a positive amount.");
      return false;
    }
    if (
      selectedPlatforms.includes("googleAds") &&
      googleCampaignType !== "APP" &&
      googleCampaignType !== "HOTEL" &&
      effectiveGooglePerformanceGoal === "CONVERSION_VALUE" &&
      googleTargetRoas &&
      !isPositiveAmount(googleTargetRoas)
    ) {
      setError(
        "Target ROAS must be greater than zero (for example, 3.0 for 300%).",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaBudgetMode === "DAILY" &&
      !isPositiveAmount(metaDailyBudget)
    ) {
      setError("Enter a Meta daily budget greater than zero.");
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaBudgetMode === "LIFETIME"
    ) {
      if (!isPositiveAmount(metaLifetimeBudget)) {
        setError("Enter a Meta lifetime budget greater than zero.");
        return false;
      }
      if (
        !metaStartTime ||
        !metaEndTime ||
        new Date(metaEndTime) <= new Date(metaStartTime)
      ) {
        setError(
          "Lifetime budgets require a valid start time and an end time later than the start time.",
        );
        return false;
      }
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaBudgetMode === "DAILY" &&
      ((metaStartTime && !metaEndTime) ||
        (!metaStartTime && metaEndTime) ||
        (metaStartTime &&
          metaEndTime &&
          new Date(metaEndTime) <= new Date(metaStartTime)))
    ) {
      setError(
        "For a daily budget schedule, provide both start and end times and make the end later than the start.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaBuyingType === "RESERVED"
    ) {
      setError(
        "Meta Reserved buying requires a separate Reach & Frequency reservation workflow. This form currently prepares Auction campaigns only; choose Auction until reservation predictions, booking and Ad Set assignment are implemented.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaPlacementMode === "MANUAL" &&
      (!metaPublisherPlatforms.length ||
        (metaPublisherPlatforms.includes("facebook") &&
          !metaFacebookPositions.length) ||
        (metaPublisherPlatforms.includes("instagram") &&
          !metaInstagramPositions.length) ||
        (metaPublisherPlatforms.includes("messenger") &&
          !metaMessengerPositions.length) ||
        (metaPublisherPlatforms.includes("audience_network") &&
          !metaAudienceNetworkPositions.length))
    ) {
      setError(
        "Select at least one placement position for every selected Meta publisher platform.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      !effectiveMetaOptimizationGoal
    ) {
      setError("Choose a Meta optimization goal for the selected objective.");
      return false;
    }
    if (selectedPlatforms.includes("metaAds")) {
      /*const countryCodes = metaCountries
        .split(",")
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
      const minAge = Number(metaAgeMin);
      const maxAge = Number(metaAgeMax);
      if (
        !countryCodes.length ||
        countryCodes.some((code) => !/^[A-Z]{2}$/.test(code))
      ) {
        setError(
          "Enter one or more two-letter country codes for Meta targeting, such as IN or US.",
        );
        return false;
      }
      const regionKeys = metaRegionKeys
        .split(/[\n,]+/)
        .map((v) => v.trim())
        .filter(Boolean);
      const cityKeys = metaCityKeys
        .split(/[\n,]+/)
        .map((v) => v.trim())
        .filter(Boolean);
      const zipKeys = metaZipKeys
        .split(/[\n,]+/)
        .map((v) => v.trim())
        .filter(Boolean);
      if ([...regionKeys, ...cityKeys].some((key) => !/^\d+$/.test(key))) {
        setError(
          "Meta region and city targeting require numeric geo-location keys from Meta's location search.",
        );
        return false;
      }
      if (
        cityKeys.length &&
        (!isPositiveAmount(metaCityRadius) || Number(metaCityRadius) > 80)
      ) {
        setError(
          "Enter a city radius greater than zero and no more than 80 km/miles.",
        );
        return false;
      }
      if (zipKeys.some((key) => !/^[A-Z]{2}:[A-Za-z0-9 -]+$/i.test(key))) {
        setError(
          "Use Meta ZIP keys in country-prefixed format, such as US:94103.",
        );
        return false;
      }
      const interestIds = metaAudienceInterestIds
        .split(/[\n,]+/)
        .map((v) => v.trim())
        .filter(Boolean);
      const includeIds = metaIncludedCustomAudienceIds
        .split(/[\n,]+/)
        .map((v) => v.trim())
        .filter(Boolean);
      const excludeIds = metaExcludedCustomAudienceIds
        .split(/[\n,]+/)
        .map((v) => v.trim())
        .filter(Boolean);
      if (
        [...interestIds, ...includeIds, ...excludeIds].some(
          (id) => !/^\d+$/.test(id),
        )
      ) {
        setError(
          "Meta interest and Custom Audience fields require numeric IDs, not names.",
        );
        return false;
      }
      if (includeIds.some((id) => excludeIds.includes(id))) {
        setError(
          "The same Custom Audience cannot be included and excluded at once.",
        );
        return false;
      }
      if (
        !Number.isInteger(minAge) ||
        !Number.isInteger(maxAge) ||
        minAge < 18 ||
        maxAge > 65 ||
        minAge > maxAge
      ) {
        setError(
          "Enter a valid Meta age range from 18 to 65, with minimum age not greater than maximum age.",
        );
        return false;
      }*/
      const metaObjective = metaObjectiveMap[objective];
      const metaCurrency = selectedCurrency(connections.metaAds);

      const pageId = metaPageId.trim();
      const instagramActorId = metaInstagramActorId.trim();

      const hasRealPageId = isRealMetaId(pageId);
      const hasRealInstagramActorId = isRealMetaId(instagramActorId);

      const metaDestination = metaDestinationUrl.trim() || websiteUrl.trim();
      const metaImageUrl = metaCreativeImageUrl.trim();

      const metaPixel = metaPixelId.trim();
      const metaConversionEventValue = metaConversionEvent.trim();

      const hasRealPixel = isRealMetaId(metaPixel);

      const requiresWebsiteConversionPixel = [
        "OFFSITE_CONVERSIONS",
        "VALUE",
      ].includes(effectiveMetaOptimizationGoal);

      const isHttpsUrl = (value: string) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      };

      if (!hasRealPageId) {
        throw new Error(
          "Enter a real Meta Page ID accessible to your connected Meta account.",
        );
      }

      if (
        requiresWebsiteConversionPixel &&
        (!hasRealPixel || !metaConversionEventValue)
      ) {
        throw new Error(
          "Website conversion optimization requires a real Meta Pixel ID and a conversion event such as PURCHASE.",
        );
      }

      if (!/^[A-Z]{3}$/.test(metaCurrency)) {
        throw new Error(
          "Unable to determine a valid three-letter currency for the selected Meta account.",
        );
      }

      if (!isHttpsUrl(metaImageUrl)) {
        throw new Error("Enter a valid HTTPS URL for the Meta creative image.");
      }

      if (!isHttpsUrl(metaDestination)) {
        throw new Error(
          "Enter a valid HTTPS URL for the Meta website destination.",
        );
      }
      const metaBudgetAmount =
        metaBudgetMode === "DAILY"
          ? Number(metaDailyBudget)
          : Number(metaLifetimeBudget);

      if (!Number.isFinite(metaBudgetAmount) || metaBudgetAmount <= 0) {
        throw new Error("Enter a valid positive Meta campaign budget.");
      }

      // Current backend Campaign-level bidding input does not expose
      // bid amount or minimum-ROAS constraints.
      if (
        metaBudgetLevel === "CAMPAIGN" &&
        metaBidStrategy !== "LOWEST_COST_WITHOUT_CAP"
      ) {
        throw new Error(
          "The current Campaign-level Meta budget flow supports LOWEST_COST_WITHOUT_CAP only. Select Ad Set-level budgeting to use Bid Cap, Cost Cap or Minimum ROAS.",
        );
      }

      if (
        metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS" &&
        effectiveMetaOptimizationGoal !== "VALUE"
      ) {
        throw new Error("Meta Minimum ROAS requires VALUE optimization.");
      }
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      ["LOWEST_COST_WITH_BID_CAP", "COST_CAP"].includes(metaBidStrategy) &&
      !isPositiveAmount(metaBidAmount)
    ) {
      setError(
        "Enter a positive bid amount for the selected Meta bid strategy.",
      );
      return false;
    }
    if (
      selectedPlatforms.includes("metaAds") &&
      metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS"
    ) {
      if (
        effectiveMetaOptimizationGoal !== "VALUE" ||
        !isPositiveAmount(metaMinimumRoas)
      ) {
        setError(
          "Meta Minimum ROAS requires the VALUE optimization goal and a positive ROAS floor.",
        );
        return false;
      }
    }
    setError("");
    return true;
  };

  const validateAdStructure = () => {
    if (selectedPlatforms.includes("googleAds")) {
      if (googleCampaignType === "PERFORMANCE_MAX") {
        if (!pmaxAssetGroupName.trim()) {
          setError("Enter a name for the Performance Max Asset Group.");
          return false;
        }
      } else {
        if (!googleAdGroupName.trim() && googleCampaignType !== "HOTEL") {
          setError("Enter a Google Ads Ad Group name.");
          return false;
        }
        if (googleCampaignType === "SEARCH") {
          const keywords = googleKeywordLines
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
          if (!keywords.length) {
            setError("Add at least one keyword for this Search Ad Group.");
            return false;
          }
          if (
            googleCampaignType === "SEARCH" &&
            effectiveGoogleBiddingMode === "MANUAL_CPC" &&
            !isPositiveAmount(googleDefaultCpcBid)
          ) {
            setError(
              "Enter a positive default CPC bid for the Manual CPC Search Ad Group.",
            );
            return false;
          }
        }
        if (
          googleCampaignType === "DISPLAY" &&
          ["MANUAL_CPC", "MANUAL_CPM"].includes(effectiveGoogleBiddingMode) &&
          !isPositiveAmount(googleDefaultCpcBid)
        ) {
          setError(
            "Enter a positive Ad Group-level bid for the selected manual Display bidding method.",
          );
          return false;
        }
        if (googleCampaignType === "HOTEL" && !googleHotelAdGroupName.trim()) {
          setError("Enter a Hotel Ad Group name.");
          return false;
        }
      }
    }

    if (selectedPlatforms.includes("metaAds") && !metaAdSetName.trim()) {
      setError("Enter a Meta Ad Set name.");
      return false;
    }

    setError("");
    return true;
  };

  const isValidHttpUrl = (value: string) => {
    try {
      const parsed = new URL(value.trim());
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  const validateAdCreation = () => {
    if (selectedPlatforms.includes("googleAds")) {
      if (googleCampaignType === "SEARCH") {
        const headlines = googleSearchHeadlines
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const descriptions = googleSearchDescriptions
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (!isValidHttpUrl(googleSearchFinalUrl.trim() || websiteUrl.trim())) {
          setError("Enter a valid final URL for the Google Search ad.");
          return false;
        }
        if (
          headlines.length < 3 ||
          headlines.length > 15 ||
          headlines.some((item) => item.length > 30)
        ) {
          setError(
            "Add 3–15 Google Search headlines, with no headline longer than 30 characters.",
          );
          return false;
        }
        if (
          descriptions.length < 2 ||
          descriptions.length > 4 ||
          descriptions.some((item) => item.length > 90)
        ) {
          setError(
            "Add 2–4 Google Search descriptions, with no description longer than 90 characters.",
          );
          return false;
        }
      } else if (googleCampaignType === "PERFORMANCE_MAX") {
        const headlines = pmaxHeadlines
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const descriptions = pmaxDescriptions
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (!isValidHttpUrl(pmaxFinalUrl.trim() || websiteUrl.trim())) {
          setError(
            "Enter a valid final URL for the Performance Max Asset Group.",
          );
          return false;
        }
        const longHeadlines = pmaxLongHeadline
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (
          headlines.length < 3 ||
          headlines.length > 15 ||
          headlines.some((item) => item.length > 30)
        ) {
          setError(
            "Performance Max needs 3–15 headlines, each no longer than 30 characters.",
          );
          return false;
        }
        if (
          longHeadlines.length < 1 ||
          longHeadlines.length > 5 ||
          longHeadlines.some((item) => item.length > 90)
        ) {
          setError(
            "Add 1–5 Performance Max long headlines, each no longer than 90 characters.",
          );
          return false;
        }
        if (
          descriptions.length < 2 ||
          descriptions.length > 5 ||
          descriptions.some((item) => item.length > 90)
        ) {
          setError(
            "Performance Max needs 2–5 descriptions, each no longer than 90 characters.",
          );
          return false;
        }
        if (!descriptions.some((item) => item.length <= 60)) {
          setError(
            "At least one Performance Max description must be 60 characters or fewer.",
          );
          return false;
        }
        if (!pmaxBusinessName.trim() || pmaxBusinessName.trim().length > 25) {
          setError(
            "Enter a Performance Max business name (maximum 25 characters).",
          );
          return false;
        }
        if (
          ![pmaxLogoUrl, pmaxLandscapeImageUrl, pmaxSquareImageUrl].every(
            isValidHttpUrl,
          )
        ) {
          setError(
            "Enter valid URLs for the PMax logo, landscape image, and square image.",
          );
          return false;
        }
      } else if (googleCampaignType === "DISPLAY") {
        const headlines = googleDisplayHeadlines
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const descriptions = googleDisplayDescriptions
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (
          !isValidHttpUrl(googleDisplayFinalUrl.trim() || websiteUrl.trim())
        ) {
          setError("Enter a valid final URL for the responsive Display ad.");
          return false;
        }
        if (
          headlines.length < 1 ||
          headlines.length > 5 ||
          headlines.some((item) => item.length > 30)
        ) {
          setError(
            "Responsive Display requires 1–5 headlines, each no longer than 30 characters.",
          );
          return false;
        }
        if (
          !googleDisplayLongHeadline.trim() ||
          googleDisplayLongHeadline.trim().length > 90
        ) {
          setError("Enter one Display long headline (maximum 90 characters).");
          return false;
        }
        if (
          descriptions.length < 1 ||
          descriptions.length > 5 ||
          descriptions.some((item) => item.length > 90)
        ) {
          setError(
            "Responsive Display requires 1–5 descriptions, each no longer than 90 characters.",
          );
          return false;
        }
        if (
          !googleDisplayBusinessName.trim() ||
          googleDisplayBusinessName.trim().length > 25
        ) {
          setError("Enter a Display business name (maximum 25 characters).");
          return false;
        }
        if (
          ![googleDisplayImageUrl, googleDisplaySquareImageUrl].every(
            isValidHttpUrl,
          )
        ) {
          setError(
            "Responsive Display requires valid landscape and square image URLs.",
          );
          return false;
        }
      } else if (googleCampaignType === "DEMAND_GEN") {
        if (
          !isValidHttpUrl(googleDisplayFinalUrl.trim() || websiteUrl.trim())
        ) {
          setError("Enter a valid final URL for the Demand Gen ad.");
          return false;
        }
        if (!googleDisplayBusinessName.trim()) {
          setError("Enter the Demand Gen business name.");
          return false;
        }
        if (googleDemandGenFormat === "MULTI_ASSET") {
          const headlines = googleDisplayHeadlines
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
          const descriptions = googleDisplayDescriptions
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
          if (
            !headlines.length ||
            !descriptions.length ||
            !isValidHttpUrl(googleDisplayImageUrl)
          ) {
            setError(
              "Demand Gen multi-asset ads need headlines, descriptions and at least one valid image URL.",
            );
            return false;
          }
        } else if (googleDemandGenFormat === "PRODUCT_FEED") {
          if (
            !/^\d+$/.test(googleMerchantCenterId.trim()) ||
            !googleDemandGenProductHeadline.trim() ||
            !googleDemandGenProductDescription.trim() ||
            !isValidHttpUrl(googleDemandGenProductLogoUrl)
          ) {
            setError(
              "Demand Gen product ads require a linked Merchant Center ID, headline, description and valid square logo URL.",
            );
            return false;
          }
        } else if (googleDemandGenFormat === "VIDEO_RESPONSIVE") {
          if (
            !googleDemandGenVideoIds.trim() ||
            !isValidHttpUrl(googleDemandGenLogoUrl)
          ) {
            setError(
              "Demand Gen video ads require at least one YouTube video ID and a valid logo image URL (v24+).",
            );
            return false;
          }
        } else {
          const cards = googleDemandGenCarouselCards
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
          if (
            cards.length < 2 ||
            cards.length > 10 ||
            cards.some(
              (item) =>
                item.split("|").length < 3 ||
                !isValidHttpUrl(item.split("|")[1]?.trim() || "") ||
                !isValidHttpUrl(item.split("|")[2]?.trim() || ""),
            )
          ) {
            setError(
              "Demand Gen Carousel requires 2–10 lines in the format: headline | image URL | final URL.",
            );
            return false;
          }
        }
      } else if (googleCampaignType === "APP") {
        const headlines = googleAppHeadlines
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const descriptions = googleAppDescriptions
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (headlines.length < 2 || !descriptions.length) {
          setError(
            "App campaigns need at least two text headlines and one description for the selected App Ad draft.",
          );
          return false;
        }
        const imageUrls = googleAppImageUrls
          .split(/[\n,]+/)
          .map((v) => v.trim())
          .filter(Boolean);
        if (
          !imageUrls.every(isValidHttpUrl) ||
          imageUrls.length +
            googleAppYoutubeVideoIds
              .split(/[\n,]+/)
              .map((v) => v.trim())
              .filter(Boolean).length ===
            0
        ) {
          setError(
            "Add at least one valid image asset URL or YouTube video ID for the App Ad.",
          );
          return false;
        }
      }
    }

    if (selectedPlatforms.includes("metaAds")) {
      if (!metaPageId.trim()) {
        setError("Enter the Facebook Page ID used for the Meta ad creative.");
        return false;
      }
      if (metaDestinationType === "APP" && objective !== "APP_PROMOTION") {
        setError(
          "Choose the App Promotion objective when using a Meta App destination.",
        );
        return false;
      }
      if (metaDestinationType === "INSTANT_FORM" && objective !== "LEADS") {
        setError("Instant Form destination requires the Leads objective.");
        return false;
      }
      if (
        metaDestinationType === "WEBSITE" &&
        ["OFFSITE_CONVERSIONS", "VALUE"].includes(
          effectiveMetaOptimizationGoal,
        ) &&
        (!metaPixelId.trim() || !metaConversionEvent.trim())
      ) {
        setError(
          "Website conversion/value optimization requires a Pixel ID and conversion event.",
        );
        return false;
      }
      if (!metaPrimaryText.trim() || !metaAdHeadline.trim()) {
        setError("Enter the Meta ad primary text and headline.");
        return false;
      }
      if (
        metaCreativeFormat === "SINGLE_IMAGE" &&
        !isValidHttpUrl(metaCreativeImageUrl)
      ) {
        setError("Enter a valid image URL for the Meta single-image creative.");
        return false;
      }
      if (
        metaCreativeFormat === "SINGLE_VIDEO" &&
        !metaCreativeVideoId.trim()
      ) {
        setError(
          "Enter the uploaded Meta Video ID for the single-video creative.",
        );
        return false;
      }
      if (metaCreativeFormat === "CAROUSEL") {
        const cards = metaCarouselCards
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        if (
          cards.length < 2 ||
          cards.length > 10 ||
          cards.some(
            (item) =>
              item.split("|").length < 3 ||
              !isValidHttpUrl(item.split("|")[1]?.trim() || "") ||
              !isValidHttpUrl(item.split("|")[2]?.trim() || ""),
          )
        ) {
          setError(
            "Meta carousel needs 2–10 lines in the format: headline | image URL | destination URL.",
          );
          return false;
        }
      }
      if (
        metaDestinationType === "WEBSITE" &&
        !isValidHttpUrl(metaDestinationUrl.trim() || websiteUrl.trim())
      ) {
        setError("Enter a valid Meta website destination URL.");
        return false;
      }
      if (metaDestinationType === "INSTANT_FORM" && !metaInstantFormId.trim()) {
        setError(
          "Select or enter an existing Meta Instant Form ID for this lead ad.",
        );
        return false;
      }
      if (
        metaDestinationType === "MESSAGING" &&
        !metaMessagingDestinationId.trim()
      ) {
        setError("Select or enter the connected messaging destination ID.");
        return false;
      }
      if (
        metaDestinationType === "APP" &&
        (!metaAppId.trim() ||
          !metaAppStoreUrl.trim() ||
          !isValidHttpUrl(metaAppStoreUrl.trim()))
      ) {
        setError(
          "Enter the promoted app ID and a valid App Store / Play Store URL for this Meta App destination.",
        );
        return false;
      }
      if (
        metaDestinationType === "MESSAGING" &&
        !["LEADS", "ENGAGEMENT"].includes(objective)
      ) {
        setError(
          "Choose Leads or Engagement for a Meta messaging destination.",
        );
        return false;
      }
      if (websiteUrl.trim() && !isValidHttpUrl(websiteUrl)) {
        setError(
          "Enter a valid website URL before using it as the Meta ad destination.",
        );
        return false;
      }
    }

    setError("");
    return true;
  };

  const goNext = () => {
    if (step === 1 && !validateBasics()) return;
    if (step === 2 && !validatePlatformSettings()) return;
    if (step === 3 && !validateAdStructure()) return;
    if (step === 4 && !validateAdCreation()) return;
    clearPreview();
    setError("");
    setStep((current) => Math.min(current + 1, 5));
  };

  const goBack = () => {
    setError("");
    clearPreview();
    setStep((current) => Math.max(current - 1, 1));
  };

  const prepareCampaign = () => {
    if (
      !validateBasics() ||
      !validatePlatformSettings() ||
      !validateAdStructure() ||
      !validateAdCreation() ||
      !objective
    ) {
      return;
    }

    let executionPayload: CampaignExecutionPayload;

    try {
      executionPayload = buildExecutionPayload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to build the backend campaign request.",
      );
      return;
    }

    const payload = {
      contractVersion: "campaign-builder.v1",
      providerApiTargets: { googleAds: "v26", metaMarketingApi: "v26.0" },
      contractType: "NORMALIZED_PROVIDER_INTENT_NOT_RAW_API_BODY",
      common: {
        name: campaignName.trim(),
        businessName: businessName.trim(),
        websiteUrl: websiteUrl.trim() || null,
        description: description.trim() || null,
        objective,
      },
      platforms: selectedPlatforms,
      creativeAssetReferences: assetLibrary
        .filter((asset) => attachedCreativeAssetIds.includes(asset.id))
        .map((asset) => ({
          assetId: asset.id,
          name: asset.name,
          kind: asset.kind,
          sourceUrl: asset.url,
          source: asset.origin || "MANUAL",
          prompt: asset.prompt || null,
          aspectRatio: asset.aspectRatio || null,
          intendedPlatforms: asset.platformTargets || selectedPlatforms,
          approvalStatus: "APPROVED_DEMO_ASSET",
          providerUploadRequired: true,
          note:
            asset.kind === "VIDEO"
              ? "Video file must be generated/uploaded to the provider-compatible host before linking. Google Ads commonly requires a YouTube video reference; Meta requires a video upload and returned video ID."
              : "Demo image URL must be replaced with an uploaded, validated media asset before provider mutation.",
        })),
      providerConfigurations: {
        ...(selectedPlatforms.includes("googleAds") && {
          googleAds: {
            accountId: connections.googleAds.selectedAccountId,
            campaign: {
              name: campaignName.trim(),
              campaignType: googleCampaignType,
              advertising_channel_type: googleCampaignTypes.find(
                (item) => item.value === googleCampaignType,
              )?.channelType,
              marketingObjective: googleMarketingObjective,
              conversionGoalConfiguration:
                googleCustomConversionGoalResourceName.trim()
                  ? {
                      mode: "CUSTOM_CONVERSION_GOAL",
                      customConversionGoalResourceName:
                        googleCustomConversionGoalResourceName.trim(),
                      apiMapping:
                        "After campaign creation, update ConversionGoalCampaignConfig.custom_conversion_goal using ConversionGoalCampaignConfigService. The custom goal must already exist in the effective conversion customer.",
                    }
                  : {
                      mode: "ACCOUNT_DEFAULT",
                      apiMapping:
                        "Keep account-level CustomerConversionGoal settings; do not invent a Campaign objective field.",
                    },
              ...(googleCampaignType === "APP" &&
                googleAppSubtype === "APP_CAMPAIGN_FOR_ENGAGEMENT" && {
                  selectiveOptimizationConversionActionResourceNames:
                    googleAppSelectiveConversionActions
                      .split(/[\n,]+/)
                      .map((v) => v.trim())
                      .filter(Boolean),
                }),
              ...(googleCampaignType === "APP" && {
                advertising_channel_sub_type: googleAppSubtype,
                app_campaign_setting: {
                  app_id: googleAppId.trim(),
                  app_store: googleAppStore,
                  bidding_strategy_goal_type: effectiveGoogleAppGoal,
                },
                biddingStrategy:
                  selectedGoogleAppGoal.targetKind === "CPA"
                    ? "TARGET_CPA"
                    : selectedGoogleAppGoal.targetKind === "ROAS"
                      ? "TARGET_ROAS"
                      : effectiveGoogleAppGoal ===
                          "OPTIMIZE_TOTAL_VALUE_WITHOUT_TARGET_ROAS"
                        ? "MAXIMIZE_CONVERSION_VALUE"
                        : "MAXIMIZE_CONVERSIONS",
                ...(selectedGoogleAppGoal.targetKind === "CPA" && {
                  targetCpaAmount: Number(googleAppTargetCost),
                }),
                ...(selectedGoogleAppGoal.targetKind === "ROAS" && {
                  targetRoas: Number(googleAppTargetRoas),
                }),
              }),
              ...(googleCampaignType === "SHOPPING" && {
                shopping_setting: {
                  merchant_id: googleMerchantCenterId.trim(),
                  campaign_priority: Number(googleShoppingPriority),
                  ...(googleShoppingFeedLabel.trim() && {
                    feed_label: googleShoppingFeedLabel.trim(),
                  }),
                },
              }),
              ...(googleCampaignType === "DEMAND_GEN" &&
                googleDemandGenFormat === "PRODUCT_FEED" && {
                  shopping_setting: {
                    merchant_id: googleMerchantCenterId.trim(),
                    ...(googleShoppingFeedLabel.trim() && {
                      feed_label: googleShoppingFeedLabel.trim(),
                    }),
                  },
                }),
              ...(googleCampaignType === "HOTEL" && {
                hotel_setting: { hotel_center_id: googleHotelCenterId.trim() },
                network_settings: { target_google_search: true },
                biddingStrategy: googleHotelBidStrategy,
                hotelCpcBidCeilingAmount: Number(googleHotelBidCeiling),
                hotelTargeting: {
                  country: googleHotelTargetCountry.trim().toUpperCase(),
                  language: googleHotelLanguage.trim().toLowerCase(),
                },
              }),
              ...(googleCampaignType !== "APP" &&
                googleCampaignType !== "HOTEL" && {
                  performanceGoalPreset: effectiveGooglePerformanceGoal,
                  biddingMode: effectiveGoogleBiddingMode,
                  ...(effectiveGoogleBiddingScope === "STANDARD" && {
                    biddingStrategy: effectiveGoogleBiddingStrategy,
                  }),
                  ...(effectiveGoogleBiddingScope === "PORTFOLIO" && {
                    portfolioBiddingStrategyResourceName:
                      googlePortfolioStrategyResourceName.trim(),
                  }),
                  ...(googleCampaignType === "DEMAND_GEN" &&
                    effectiveGooglePerformanceGoal === "CLICKS" && {
                      biddingApiMapping:
                        "Map Website clicks to the Google Maximize Clicks strategy only where supported by the selected campaign type. The TargetSpend scheme remains documented, but target_spend.target_spend_micros is deprecated; do not populate that deprecated amount field or send a generic Target CPC field.",
                    }),
                  ...(effectiveGoogleBiddingMode === "MANUAL_CPC" && {
                    manualCpc: { enhancedCpcEnabled: false },
                    adGroupBidSetupRequired: true,
                  }),
                  ...(effectiveGoogleBiddingMode === "MANUAL_CPM" && {
                    manualCpm: {},
                    adGroupBidSetupRequired: true,
                  }),
                  ...(["SEARCH", "PERFORMANCE_MAX"].includes(
                    googleCampaignType,
                  ) &&
                    effectiveGoogleBiddingMode === "AUTOMATED" &&
                    effectiveGooglePerformanceGoal === "CONVERSIONS" &&
                    googleTargetCpa && {
                      targetCpaAmount: Number(googleTargetCpa),
                    }),
                  ...(effectiveGoogleBiddingMode === "AUTOMATED" &&
                    effectiveGooglePerformanceGoal === "CONVERSION_VALUE" &&
                    googleTargetRoas && {
                      targetRoas: Number(googleTargetRoas),
                    }),
                  ...(effectiveGooglePerformanceGoal === "IMPRESSION_SHARE" &&
                    effectiveGoogleBiddingMode === "AUTOMATED" && {
                      targetImpressionShare: {
                        location: googleImpressionShareLocation,
                        locationFraction:
                          Number(googleImpressionSharePercent) / 100,
                        maxCpcBidCeilingAmount: Number(
                          googleImpressionShareMaxCpc,
                        ),
                      },
                    }),
                }),
              ...(googleCampaignType === "SEARCH" && {
                network_settings: {
                  target_google_search: true,
                  target_search_network: googleSearchPartners,
                  target_content_network: googleDisplayExpansion,
                },
              }),
              campaignBudget:
                effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                  ? {
                      period: "CUSTOM_PERIOD",
                      totalAmount: Number(googleCampaignTotalBudget),
                      explicitlyShared: false,
                      amountField: "total_amount_micros",
                    }
                  : {
                      period: "DAILY",
                      averageDailyAmount: Number(googleDailyBudget),
                      explicitlyShared: false,
                      amountField: "amount_micros",
                    },
              budgetApiMapping: {
                service: "CampaignBudgetService.MutateCampaignBudgets",
                resource: "CampaignBudget",
                apiAmountField:
                  effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                    ? "total_amount_micros"
                    : "amount_micros",
                apiPeriod:
                  effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                    ? "CUSTOM_PERIOD"
                    : "DAILY",
                amountConversion:
                  "Google Ads account currency × 1,000,000 micros per currency unit.",
                explicitly_shared: false,
                attachToCampaign:
                  "Campaign.campaign_budget = CampaignBudget.resource_name",
                totalBudgetSchedule:
                  effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                    ? "Set Campaign.start_date_time and Campaign.end_date_time in the Google Ads customer time zone; end_date_time is required for CUSTOM_PERIOD."
                    : null,
                atomicOption:
                  "Prefer one GoogleAdsService.Mutate request with temporary resource IDs for CampaignBudget + Campaign to avoid an orphaned budget; otherwise create budget first and clean up/reuse it if Campaign creation fails.",
              },
              biddingApiMapping: {
                scope: effectiveGoogleBiddingScope,
                ...(effectiveGoogleBiddingScope === "PORTFOLIO"
                  ? {
                      service: "BiddingStrategyService / CampaignService",
                      resource: "BiddingStrategy",
                      strategyResourceName:
                        googlePortfolioStrategyResourceName.trim(),
                      campaignField: "Campaign.bidding_strategy",
                      instruction:
                        "Verify customer ownership and campaign/bidding-scheme compatibility, then reference the existing portfolio strategy. If creating a new strategy, use BiddingStrategyService.MutateBiddingStrategies first.",
                    }
                  : {
                      service:
                        "CampaignService.MutateCampaigns or GoogleAdsService.Mutate",
                      resource: "Campaign.campaign_bidding_strategy union",
                      strategy: effectiveGoogleBiddingStrategy,
                      instruction:
                        "Map the strategy to the matching typed union field (for example maximize_conversions, maximize_conversion_value, target_spend, target_impression_share, manual_cpc, manual_cpm, target_cpm or percent_cpc); do not send the builder label as a literal API field.",
                    }),
                ...(["SEARCH", "PERFORMANCE_MAX"].includes(
                  googleCampaignType,
                ) &&
                  effectiveGooglePerformanceGoal === "CONVERSIONS" &&
                  googleTargetCpa && {
                    targetCpaAmount: Number(googleTargetCpa),
                    apiField: "maximize_conversions.target_cpa_micros",
                  }),
                ...(effectiveGooglePerformanceGoal === "CONVERSION_VALUE" &&
                  googleTargetRoas && {
                    targetRoas: Number(googleTargetRoas),
                    apiField: "maximize_conversion_value.target_roas",
                  }),
                manualBidPlacement:
                  effectiveGoogleBiddingMode === "MANUAL_CPC" ||
                  effectiveGoogleBiddingMode === "MANUAL_CPM"
                    ? "AdGroup.cpc_bid_micros or AdGroup.cpm_bid_micros, as supported by the selected campaign type"
                    : null,
              },
              ...(googleStartDate && {
                startDate: googleStartDate.replaceAll("-", ""),
              }),
              ...(googleEndDate && {
                endDate: googleEndDate.replaceAll("-", ""),
              }),
              ...(googleCampaignType === "DEMAND_GEN"
                ? {
                    campaignCriteria: {
                      locationResourceNames: [],
                      languageResourceNames: [],
                    },
                    adGroupCriteria: {
                      locationResourceNames: geoResources,
                      languageResourceNames: languageResources,
                      apiMapping:
                        "Create AdGroupCriterion location and language criteria; Demand Gen location/language criteria are configured at Ad Group level.",
                    },
                  }
                : {
                    campaignCriteria: {
                      locationResourceNames: geoResources,
                      languageResourceNames: languageResources,
                    },
                  }),
              budgetCurrency: selectedCurrency(connections.googleAds),
              ...(["PERFORMANCE_MAX", "DEMAND_GEN", "APP"].includes(
                googleCampaignType,
              ) && {
                campaignBudgetSettings: {
                  explicitlyShared: false,
                  note: "Create a dedicated CampaignBudget; these campaign workflows do not use a shared campaign budget.",
                },
              }),
              contains_eu_political_advertising: googleEuPoliticalStatus,
              status: "PAUSED",
            },
            ...(googleCampaignType === "PERFORMANCE_MAX"
              ? {
                  assetGroup: {
                    name: pmaxAssetGroupName.trim(),
                    final_urls: [pmaxFinalUrl.trim() || websiteUrl.trim()],
                    textAssets: {
                      headlines: pmaxHeadlines
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean),
                      longHeadlines: pmaxLongHeadline
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean),
                      descriptions: pmaxDescriptions
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean),
                      businessName: pmaxBusinessName.trim(),
                    },
                    imageAssets: {
                      logoUrl: pmaxLogoUrl.trim(),
                      marketingImageUrl: pmaxLandscapeImageUrl.trim(),
                      squareMarketingImageUrl: pmaxSquareImageUrl.trim(),
                      ...(pmaxPortraitImageUrl.trim() && {
                        portraitMarketingImageUrl: pmaxPortraitImageUrl.trim(),
                      }),
                      youtubeVideoIds: pmaxYoutubeVideoIds
                        .split(/[\n,]+/)
                        .map((item) => item.trim())
                        .filter(Boolean),
                    },
                    ...(pmaxSearchThemes.trim() && {
                      searchThemes: pmaxSearchThemes
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    }),
                    ...(pmaxAudienceResourceNames.trim() && {
                      audienceSignals: {
                        audienceResourceNames: pmaxAudienceResourceNames
                          .split(/[\n,]+/)
                          .map((item) => item.trim())
                          .filter(Boolean),
                        apiMapping:
                          "Create one AssetGroupSignal.audience operation per Audience resource name. A Google Audience can contain user-list segments and other dimensions.",
                      },
                    }),
                    status: "PAUSED",
                    note: "The backend must download or upload these media URLs as Google Asset resources and link all required assets with AssetGroupAsset operations in the same atomic mutate request.",
                  },
                }
              : {
                  adGroup: {
                    name:
                      googleCampaignType === "HOTEL"
                        ? googleHotelAdGroupName.trim()
                        : googleAdGroupName.trim(),
                    status: "PAUSED",
                    ...(googleCampaignType === "APP" &&
                      googleAppSubtype === "APP_CAMPAIGN_FOR_ENGAGEMENT" && {
                        audienceSetting: { useAudienceGrouped: true },
                        audienceCriteria: [
                          {
                            type: "AUDIENCE",
                            audienceResourceName:
                              googleAppEngagementAudienceResource.trim(),
                            apiMapping:
                              "Create AdGroupCriterion.audience.audience with AudienceInfo; enable AdGroup.audience_setting.use_audience_grouped=true. The Audience should include eligible app-user segments.",
                          },
                        ],
                      }),
                    ...(googleCampaignType === "SHOPPING" && {
                      type: "SHOPPING_PRODUCT_ADS",
                      productListingGroup: {
                        partitionType: googleShoppingProductGroupType,
                        value: googleShoppingProductGroupValue.trim() || null,
                        note: "Build a root listing group and valid subdivision/unit tree with AdGroupCriterion resources before creating the product ad.",
                      },
                    }),
                    ...(googleCampaignType === "HOTEL" && {
                      ad_group_type: "HOTEL_ADS",
                      hotelListingGroups: {
                        selection: googleHotelListingMode,
                        propertyIds:
                          googleHotelListingMode === "SELECTED_HOTELS"
                            ? googleHotelPropertyIds
                                .split(/[\n,]+/)
                                .map((item) => item.trim())
                                .filter(Boolean)
                            : [],
                      },
                    }),
                    ...(["SEARCH", "DISPLAY", "SHOPPING"].includes(
                      googleCampaignType,
                    ) &&
                      googleAdGroupUserLists.trim() && {
                        audienceCriteria: googleAdGroupUserLists
                          .split(/[\n,]+/)
                          .map((item) => item.trim())
                          .filter(Boolean)
                          .map((resourceName) => ({
                            type: "USER_LIST",
                            userListResourceName: resourceName,
                            apiMapping:
                              "Create AdGroupCriterion.user_list.user_list for each selected audience.",
                          })),
                      }),
                    ...(googleCampaignType === "DEMAND_GEN" &&
                      googleDemandGenAudienceResources.trim() && {
                        audienceCriteria: googleDemandGenAudienceResources
                          .split(/[\n,]+/)
                          .map((item) => item.trim())
                          .filter(Boolean)
                          .map((resourceName) => ({
                            type: "AUDIENCE",
                            audienceResourceName: resourceName,
                            apiMapping:
                              "Create AdGroupCriterion.audience.audience with AudienceInfo; set AdGroup.audience_setting.use_audience_grouped=true before adding criteria.",
                          })),
                      }),
                    ...(googleCampaignType === "SEARCH" && {
                      keywords: googleKeywordLines
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .map((text) => ({
                          text,
                          matchType: googleKeywordMatchType,
                          negative: false,
                        })),
                      negativeKeywords: googleNegativeKeywordLines
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .map((text) => ({
                          text,
                          matchType: googleKeywordMatchType,
                          negative: true,
                        })),
                      keywordApiMapping:
                        "Create positive and negative AdGroupCriterion resources separately; use keyword.match_type and negative=true on the criterion.",
                      ...(effectiveGoogleBiddingMode === "MANUAL_CPC" && {
                        defaultCpcBidAmount: Number(googleDefaultCpcBid),
                      }),
                    }),
                    ...(googleCampaignType === "DISPLAY" &&
                      effectiveGoogleBiddingMode === "MANUAL_CPC" && {
                        defaultCpcBidAmount: Number(googleDefaultCpcBid),
                      }),
                    ...(googleCampaignType === "DISPLAY" &&
                      effectiveGoogleBiddingMode === "MANUAL_CPM" && {
                        defaultCpmBidAmount: Number(googleDefaultCpcBid),
                      }),
                    ...(googleCampaignType === "DEMAND_GEN" && {
                      ...(googleDemandGenAudienceResources.trim() && {
                        audienceSetting: { useAudienceGrouped: true },
                      }),
                      demand_gen_ad_group_settings: {
                        channel_controls: {
                          selected_channels: demandGenChannels,
                        },
                      },
                      ...(googleDemandGenFormat === "PRODUCT_FEED" && {
                        productListingGroup: {
                          selection: googleDemandGenProductGroupMode,
                          note: "Create a ListingGroupInfo root UNIT or SUBDIVISION tree through AdGroupCriterionService; start with all-products root when no split is requested.",
                        },
                      }),
                    }),
                  },
                }),
            ...(googleCampaignType === "SHOPPING" && {
              ad: {
                name: `${googleAdGroupName.trim()} - Shopping Product Ad`,
                type: "SHOPPING_PRODUCT_AD",
                status: "PAUSED",
                apiResourceMapping:
                  "Create AdGroupAd.ad.shopping_product_ad after creating the Shopping Ad Group and its product listing group criteria.",
              },
            }),
            ...(googleCampaignType === "HOTEL" && {
              ad: {
                name: `${googleHotelAdGroupName.trim()} - Hotel Ad`,
                type: "HOTEL_AD",
                status: "PAUSED",
                apiResourceMapping:
                  "Create AdGroupAd.ad.hotel_ad with HotelAdInfo; Hotel listing group criteria are separate AdGroupCriterion resources.",
              },
            }),
            ...(googleCampaignType === "SEARCH" && {
              ad: {
                name: `${googleAdGroupName.trim()} - Responsive Search Ad`,
                type: "RESPONSIVE_SEARCH_AD",
                finalUrls: [googleSearchFinalUrl.trim() || websiteUrl.trim()],
                responsiveSearchAd: {
                  headlines: googleSearchHeadlines
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .map((text) => ({ text })),
                  descriptions: googleSearchDescriptions
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .map((text) => ({ text })),
                  ...(googleSearchPath1.trim() && {
                    path1: googleSearchPath1.trim(),
                  }),
                  ...(googleSearchPath2.trim() && {
                    path2: googleSearchPath2.trim(),
                  }),
                },
                status: "PAUSED",
                note: "Normalized responsive-search-ad draft; backend maps this to AdGroupAd and Ad.responsive_search_ad.",
              },
            }),
            ...(googleCampaignType === "DISPLAY" && {
              adCreativeDraft: {
                format: "RESPONSIVE_DISPLAY_AD",
                finalUrl: googleDisplayFinalUrl.trim() || websiteUrl.trim(),
                headlines: googleDisplayHeadlines
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
                longHeadline: googleDisplayLongHeadline.trim(),
                descriptions: googleDisplayDescriptions
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
                businessName: googleDisplayBusinessName.trim(),
                imageAssets: {
                  landscapeImageUrl: googleDisplayImageUrl.trim(),
                  squareImageUrl: googleDisplaySquareImageUrl.trim(),
                },
                status: "PAUSED",
                apiResourceMapping:
                  "AdGroupAd.ad.responsive_display_ad; upload and reference Google Asset resources.",
              },
            }),
            ...(googleCampaignType === "DEMAND_GEN" && {
              adCreativeDraft: {
                format: googleDemandGenFormat,
                finalUrl: googleDisplayFinalUrl.trim() || websiteUrl.trim(),
                businessName: googleDisplayBusinessName.trim(),
                ...(googleDemandGenFormat === "MULTI_ASSET" && {
                  headlines: googleDisplayHeadlines
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
                  descriptions: googleDisplayDescriptions
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
                  imageUrl: googleDisplayImageUrl.trim(),
                }),
                ...(googleDemandGenFormat === "PRODUCT_FEED" && {
                  productAd: {
                    headline: googleDemandGenProductHeadline.trim(),
                    description: googleDemandGenProductDescription.trim(),
                    logoImageUrl: googleDemandGenProductLogoUrl.trim(),
                  },
                  merchantCenterId: googleMerchantCenterId.trim(),
                  feedLabel: googleShoppingFeedLabel.trim() || null,
                  productListingSelection: googleDemandGenProductGroupMode,
                }),
                ...(googleDemandGenFormat === "VIDEO_RESPONSIVE" && {
                  youtubeVideoIds: googleDemandGenVideoIds
                    .split(/[\n,]+/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                  logoImageUrl: googleDemandGenLogoUrl.trim(),
                }),
                ...(googleDemandGenFormat === "CAROUSEL" && {
                  cards: googleDemandGenCarouselCards
                    .split("\n")
                    .map((row) => row.trim())
                    .filter(Boolean)
                    .map((row) => {
                      const [headline, imageUrl, finalUrl] = row
                        .split("|")
                        .map((v) => v.trim());
                      return { headline, imageUrl, finalUrl };
                    }),
                }),
                status: "PAUSED",
                apiResourceMapping:
                  "Create DemandGenMultiAssetAdInfo, DemandGenVideoResponsiveAdInfo, DemandGenCarouselAdInfo, or DemandGenProductAdInfo. Product-feed campaigns also require linked ShoppingSetting and AdGroupCriterion listing groups. Upload/link Google Asset resources before AdGroupAd creation.",
              },
            }),
            ...(googleCampaignType === "APP" && {
              ad: {
                type:
                  googleAppSubtype === "APP_CAMPAIGN_FOR_ENGAGEMENT"
                    ? "APP_ENGAGEMENT_AD"
                    : googleAppSubtype === "APP_CAMPAIGN_FOR_PRE_REGISTRATION"
                      ? "APP_PRE_REGISTRATION_AD"
                      : "APP_AD",
                headlines: googleAppHeadlines
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
                descriptions: googleAppDescriptions
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
                imageUrls: googleAppImageUrls
                  .split(/[\n,]+/)
                  .map((item) => item.trim())
                  .filter(Boolean),
                youtubeVideoIds: googleAppYoutubeVideoIds
                  .split(/[\n,]+/)
                  .map((item) => item.trim())
                  .filter(Boolean),
                status: "PAUSED",
                apiResourceMapping:
                  "Map subtype to AppAdInfo, AppEngagementAdInfo or AppPreRegistrationAdInfo. Non-text media must already exist as Google Asset resources.",
              },
            }),
          },
        }),
        ...(selectedPlatforms.includes("metaAds") && {
          metaAds: {
            accountId: connections.metaAds.selectedAccountId,
            campaign: {
              name: campaignName.trim(),
              status: "PAUSED",
              objective: metaObjectiveMap[objective],
              buying_type: metaBuyingType,
              special_ad_categories: metaSpecialAdCategories,
              budgetLevel: metaBudgetLevel,
              ...(metaBudgetLevel === "CAMPAIGN" &&
                metaBudgetMode === "DAILY" && {
                  dailyBudgetAmount: Number(metaDailyBudget),
                  bid_strategy: metaBidStrategy,
                }),
              ...(metaBudgetLevel === "CAMPAIGN" &&
                metaBudgetMode === "LIFETIME" && {
                  lifetimeBudgetAmount: Number(metaLifetimeBudget),
                  bid_strategy: metaBidStrategy,
                }),
              budgetCurrency: selectedCurrency(connections.metaAds),
              budgetApiMapping: {
                resourceOwner:
                  metaBudgetLevel === "CAMPAIGN"
                    ? "Campaign (CBO)"
                    : "Ad Set (ABO)",
                apiField:
                  metaBudgetMode === "DAILY"
                    ? "daily_budget"
                    : "lifetime_budget",
                amountConversion:
                  "Convert the entered account-currency amount to the currency's smallest unit using currency metadata; do not hardcode a ×100 conversion for every currency.",
                mutualExclusion:
                  "Campaign-level and Ad Set-level budgets must never be sent together for this setup.",
                campaignCreate:
                  metaBudgetLevel === "CAMPAIGN"
                    ? "Include budget field on Campaign create."
                    : "Omit budget fields from Campaign create.",
                adSetCreate:
                  metaBudgetLevel === "AD_SET"
                    ? "Include budget field on Ad Set create."
                    : "Omit budget fields from Ad Set create.",
              },
              biddingApiMapping: {
                strategy: metaBidStrategy,
                strategyOwner:
                  metaBudgetLevel === "CAMPAIGN"
                    ? "Campaign (CBO)"
                    : "Ad Set (ABO)",
                apiField: "bid_strategy",
                bidAmountField: [
                  "LOWEST_COST_WITH_BID_CAP",
                  "COST_CAP",
                ].includes(metaBidStrategy)
                  ? "bid_amount"
                  : null,
                roasConstraintField:
                  metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS"
                    ? "bid_constraints.roas_average_floor"
                    : null,
                bidAmountConversion:
                  "Convert bid_amount to the ad account currency smallest unit using currency metadata.",
                alwaysOnAdSetFields: ["optimization_goal", "billing_event"],
                note: "The adapter must confirm bid strategy and bid/ROAS constraint support for the selected objective, budget owner and Graph API version.",
              },
            },
            adSet: {
              name: metaAdSetName.trim(),
              campaignLink:
                "Backend supplies the newly created campaign_id returned by the Campaign create call.",
              status: "PAUSED",
              optimization_goal: effectiveMetaOptimizationGoal,
              billing_event: effectiveMetaBillingEvent,
              bidStrategyPlacement:
                metaBudgetLevel === "CAMPAIGN" ? "CAMPAIGN" : "AD_SET",
              scheduleMapping:
                "Meta start_time and end_time belong to the Ad Set, including when the budget is at Campaign level.",
              targeting: {
                geo_locations: {
                  countries: metaCountries
                    .split(",")
                    .map((code) => code.trim().toUpperCase())
                    .filter(Boolean),
                  ...(metaRegionKeys.trim() && {
                    regions: metaRegionKeys
                      .split(/[\n,]+/)
                      .map((key) => ({ key: key.trim() })),
                  }),
                  ...(metaCityKeys.trim() && {
                    cities: metaCityKeys.split(/[\n,]+/).map((key) => ({
                      key: key.trim(),
                      radius: Number(metaCityRadius),
                      distance_unit: metaCityDistanceUnit,
                    })),
                  }),
                  ...(metaZipKeys.trim() && {
                    zips: metaZipKeys
                      .split(/[\n,]+/)
                      .map((key) => ({ key: key.trim().toUpperCase() })),
                  }),
                },
                ...(metaSpecialAdCategories.length === 0 && {
                  age_min: Number(metaAgeMin),
                  age_max: Number(metaAgeMax),
                  ...(metaGender !== "ALL" && {
                    genders: [metaGender === "MEN" ? 1 : 2],
                  }),
                }),
                ...(metaAudienceInterestIds.trim() && {
                  flexible_spec: [
                    {
                      interests: metaAudienceInterestIds
                        .split(/[\n,]+/)
                        .map((id) => ({ id: id.trim() })),
                    },
                  ],
                }),
                ...(metaIncludedCustomAudienceIds.trim() && {
                  custom_audiences: metaIncludedCustomAudienceIds
                    .split(/[\n,]+/)
                    .map((id) => ({ id: id.trim() })),
                }),
                ...(metaExcludedCustomAudienceIds.trim() && {
                  excluded_custom_audiences: metaExcludedCustomAudienceIds
                    .split(/[\n,]+/)
                    .map((id) => ({ id: id.trim() })),
                }),
                ...(metaPlacementMode === "MANUAL"
                  ? {
                      publisher_platforms: metaPublisherPlatforms,
                      ...(metaPublisherPlatforms.includes("facebook") && {
                        facebook_positions: metaFacebookPositions,
                      }),
                      ...(metaPublisherPlatforms.includes("instagram") && {
                        instagram_positions: metaInstagramPositions,
                      }),
                      ...(metaPublisherPlatforms.includes("messenger") && {
                        messenger_positions: metaMessengerPositions,
                      }),
                      ...(metaPublisherPlatforms.includes(
                        "audience_network",
                      ) && {
                        audience_network_positions:
                          metaAudienceNetworkPositions,
                      }),
                    }
                  : {
                      placementMode: "AUTOMATIC",
                      adapterInstruction:
                        "Omit publisher_platforms and all placement position arrays for automatic placements. Advantage+ Audience is a separate feature and is not enabled by this selection.",
                    }),
              },
              ...(metaBudgetLevel === "AD_SET" &&
                metaBudgetMode === "DAILY" && {
                  dailyBudgetAmount: Number(metaDailyBudget),
                  bid_strategy: metaBidStrategy,
                }),
              ...(metaBudgetLevel === "AD_SET" &&
                metaBudgetMode === "LIFETIME" && {
                  lifetimeBudgetAmount: Number(metaLifetimeBudget),
                  bid_strategy: metaBidStrategy,
                }),
              ...(metaStartTime &&
                metaEndTime && {
                  start_time: new Date(metaStartTime).toISOString(),
                  end_time: new Date(metaEndTime).toISOString(),
                }),
              ...(["LOWEST_COST_WITH_BID_CAP", "COST_CAP"].includes(
                metaBidStrategy,
              ) && {
                bidAmountInput: Number(metaBidAmount),
              }),
              ...(metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && {
                bid_constraints: {
                  roas_average_floor: Math.round(
                    Number(metaMinimumRoas) * 10000,
                  ),
                },
              }),
              ...(metaDestinationType === "APP" && {
                promoted_object: {
                  application_id: metaAppId.trim(),
                  object_store_url: metaAppStoreUrl.trim(),
                },
              }),
              ...(metaDestinationType === "WEBSITE" &&
                metaPixelId.trim() && {
                  promoted_object: {
                    pixel_id: metaPixelId.trim(),
                    ...(metaConversionEvent.trim() && {
                      custom_event_type: metaConversionEvent,
                    }),
                  },
                }),
            },
            ad: {
              name: `${metaAdSetName.trim()} - Ad`,
              status: "PAUSED",
              creativeDraft: {
                format: metaCreativeFormat,
                pageId: metaPageId.trim(),
                ...(metaInstagramActorId.trim() && {
                  instagramActorId: metaInstagramActorId.trim(),
                }),
                primaryText: metaPrimaryText.trim(),
                headline: metaAdHeadline.trim(),
                description: metaAdDescription.trim() || null,
                ...(metaCreativeFormat === "SINGLE_IMAGE" && {
                  imageUrl: metaCreativeImageUrl.trim(),
                }),
                ...(metaCreativeFormat === "SINGLE_VIDEO" && {
                  uploadedVideoId: metaCreativeVideoId.trim(),
                }),
                ...(metaCreativeFormat === "CAROUSEL" && {
                  cards: metaCarouselCards
                    .split("\n")
                    .map((row) => row.trim())
                    .filter(Boolean)
                    .map((row) => {
                      const [headline, imageUrl, destinationUrl] = row
                        .split("|")
                        .map((v) => v.trim());
                      return { headline, imageUrl, destinationUrl };
                    }),
                }),
                destination: {
                  type: metaDestinationType,
                  ...(metaDestinationType === "WEBSITE" && {
                    url: metaDestinationUrl.trim() || websiteUrl.trim(),
                  }),
                  ...(metaDestinationType === "INSTANT_FORM" && {
                    instantFormId: metaInstantFormId.trim(),
                  }),
                  ...(metaDestinationType === "MESSAGING" && {
                    messagingType: metaMessagingType,
                    messagingDestinationId: metaMessagingDestinationId.trim(),
                  }),
                  ...(metaDestinationType === "APP" && {
                    appId: metaAppId.trim(),
                    appStoreUrl: metaAppStoreUrl.trim(),
                  }),
                },
                callToAction: metaCallToAction,
                apiResourceMapping:
                  "Upload image/video assets first; create AdCreative with object_story_spec or asset_feed_spec and then create Ad using creative_id. For lead forms, resolve the Page-owned lead_gen_form_id; for messaging, build the eligible Messenger/Instagram/WhatsApp destination spec; for app, map app identity/store destination and promoted_object for the selected app campaign objective.",
              },
              note: "creativeDraft is a normalized builder object, not a direct Meta Graph API field. Backend sequence: upload media to the Ad Account; create AdCreative with object_story_spec/link_data, video_data or carousel child attachments as appropriate; then create Ad using the returned creative_id and Ad Set ID.",
            },
          },
        }),
      },
      apiExecutionPlan: {
        googleAds: selectedPlatforms.includes("googleAds")
          ? {
              budget: {
                create:
                  "CampaignBudgetService.MutateCampaignBudgets (or GoogleAdsService.Mutate with temporary resource IDs for an atomic budget + campaign create)",
                update:
                  "CampaignBudgetService.MutateCampaignBudgets using the existing campaign_budget resource name; update the budget rather than replacing it where possible.",
                read: "GAQL campaign_budget query through GoogleAdsService.Search / SearchStream; join campaigns by campaign_budget resource name.",
                currentConfiguration:
                  effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                    ? "CUSTOM_PERIOD + total_amount_micros"
                    : "DAILY + amount_micros",
              },
              bidding: {
                standard:
                  "CampaignService.MutateCampaigns: set the Campaign.campaign_bidding_strategy union with one supported typed scheme.",
                portfolio:
                  "BiddingStrategyService.MutateBiddingStrategies to create/update portfolio resources; Campaign.bidding_strategy references the portfolio resource name.",
                validation:
                  "Check campaign type, strategy scheme, conversion tracking, target values, account currency and any campaign-specific restrictions before mutation.",
              },
              dependencyOrder: [
                "Validate account customer ID, currency, campaign type and bidding compatibility",
                "Create or resolve CampaignBudget resource",
                "Create Campaign with campaign_budget and campaign_bidding_strategy",
                "Create campaign-specific Ad Group / Asset Group and child resources",
                "Read back resource IDs and budget/bidding configuration",
              ],
              failureHandling:
                "For tightly dependent resources, use GoogleAdsService.Mutate with temporary resource names and atomic execution; do not enable partial_failure for dependent operations that reference temporary IDs. Use partial_failure only for independent operations and only where the specific method supports it. If a separate budget call succeeds but campaign creation fails, retain and reconcile/reuse or clean up the orphaned budget.",
            }
          : null,
        metaAds: selectedPlatforms.includes("metaAds")
          ? {
              budgetOwner:
                metaBudgetLevel === "CAMPAIGN"
                  ? "Campaign (CBO)"
                  : "Ad Set (ABO)",
              create: [
                metaBudgetLevel === "CAMPAIGN"
                  ? "POST /act_{ad_account_id}/campaigns with daily_budget or lifetime_budget plus bid_strategy when supported"
                  : "POST /act_{ad_account_id}/campaigns without budget fields",
                metaBudgetLevel === "AD_SET"
                  ? "POST /act_{ad_account_id}/adsets with daily_budget or lifetime_budget plus bid_strategy"
                  : "POST /act_{ad_account_id}/adsets with optimization_goal, billing_event, targeting and schedule; omit Ad Set budget and campaign-level bid strategy stays on Campaign",
              ],
              update:
                metaBudgetLevel === "CAMPAIGN"
                  ? "PATCH /{campaign_id} for campaign-level daily_budget / lifetime_budget and applicable bid strategy"
                  : "PATCH /{adset_id} for Ad Set daily_budget / lifetime_budget and applicable bid strategy",
              read: "Read Campaign / Ad Set budget_remaining and budget fields; use Insights for spend and delivery metrics.",
              amountConversion:
                "Convert human amounts to the ad account currency's smallest unit using currency metadata; do not assume every currency has two decimal places.",
              alwaysAdSetFields: [
                "optimization_goal",
                "billing_event",
                "targeting",
                "start_time / end_time when supplied",
              ],
              validation:
                "Never send campaign-level and Ad Set-level budgets together. Enforce lifetime-budget schedule rules, objective/optimization/billing compatibility, bid strategy requirements and bid amount / ROAS constraints.",
              dependencyOrder: [
                "Validate account currency and objective",
                "Create Campaign (include budget and bid strategy only for CBO)",
                "Create Ad Set (include budget and bid strategy only for ABO; always include optimization_goal and billing_event)",
                "Create AdCreative and Ad",
                "Read back campaign/ad set budget and delivery status",
              ],
            }
          : null,
      },
      launch: {
        initialStatus: "PAUSED",
      },
    };

    setDemoJob(null);
    setSavedDraft(null);
    setPreparedPayload(JSON.stringify(payload, null, 2));
    setApiPayloadPreview(JSON.stringify(executionPayload, null, 2));
    setCopyNotice("");
    setError("");
  };
  const submitCampaignRequest = async () => {
    if (!apiPayloadPreview) {
      setCampaignApiError(
        "Prepare the unified campaign request before submitting.",
      );
      return;
    }

    if (!isLoaded || !isSignedIn) {
      setCampaignApiError(
        "Please sign in before submitting the campaign request.",
      );
      return;
    }

    // Explicit confirmation is required before any live provider mutation.
    if (executionMode === "LIVE") {
      const confirmed = window.confirm(
        [
          "You are about to create real advertising resources.",
          "",
          "Google Ads and Meta Ads will be processed independently.",
          "All successfully created resources are intended to start PAUSED.",
          "",
          "A provider failure may happen after some parent resources have already been created.",
          "Inspect the result and provider accounts before retrying.",
          "",
          "Do you want to continue?",
        ].join("\n"),
      );

      if (!confirmed) return;
    }

    try {
      setCampaignSubmitting(true);
      setCampaignApiError("");
      setCampaignApiResponse(null);

      const token = await getToken();

      if (!token) {
        throw new Error(
          "Unable to retrieve your authentication token. Please sign in again.",
        );
      }

      const response = await fetch(`${API_BASE_URL}/api/campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: apiPayloadPreview,
        cache: "no-store",
      });

      const responseData = await response.json().catch(() => null);

      setCampaignApiResponse(responseData);

      if (!response.ok || responseData?.success === false) {
        throw new Error(
          responseData?.message ||
            `Campaign API request failed with status ${response.status}.`,
        );
      }
    } catch (err) {
      setCampaignApiError(
        err instanceof Error
          ? err.message
          : "Unable to submit the campaign request.",
      );
    } finally {
      setCampaignSubmitting(false);
    }
  };
  const placeholderMetaIds = new Set([
    "123456789012345",
    "123456789",
    "987654321",
    "600000000000001",
    "600000000000002",
    "600000000000003",
  ]);
  const isRealMetaId = (value: string) => {
    const id = value.trim();
    return /^\d+$/.test(id) && !placeholderMetaIds.has(id);
  };

  const buildExecutionPayload = (): CampaignExecutionPayload => {
    if (!objective) {
      throw new Error("Select a campaign objective.");
    }

    const splitValues = (value: string) =>
      value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);

    const usesExampleDomain = (value: string) => {
      try {
        const hostname = new URL(value).hostname.toLowerCase();
        return hostname === "example.com" || hostname.endsWith(".example.com");
      } catch {
        return true;
      }
    };

    const realMetaIds = (value: string) =>
      splitValues(value).filter(isRealMetaId);

    const providers: CampaignExecutionPayload["providers"] = {};

    // --------------------------------------------------
    // GOOGLE ADS — current global creation flow: SEARCH
    // --------------------------------------------------
    if (selectedPlatforms.includes("googleAds")) {
      if (googleCampaignType !== "SEARCH") {
        throw new Error(
          "The current global Google Ads creation flow supports SEARCH campaigns only.",
        );
      }

      if (effectiveGoogleBudgetMode !== "DAILY") {
        throw new Error(
          "The current Google Search creation flow supports a daily budget. Campaign-total budgets need a separate backend implementation.",
        );
      }

      const googleFinalUrl = googleSearchFinalUrl.trim() || websiteUrl.trim();

      if (
        effectiveGooglePerformanceGoal === "IMPRESSION_SHARE" ||
        effectiveGoogleBiddingStrategy === "TARGET_IMPRESSION_SHARE"
      ) {
        throw new Error(
          "The current Google Search campaign flow does not yet support the Impression Share bidding configuration.",
        );
      }

      // The UI uses Google's older Target Spend label for Maximize Clicks.
      const biddingStrategy =
        effectiveGoogleBiddingStrategy === "TARGET_SPEND"
          ? "MAXIMIZE_CLICKS"
          : effectiveGoogleBiddingStrategy;

      const supportedStrategies = [
        "MANUAL_CPC",
        "MAXIMIZE_CLICKS",
        "MAXIMIZE_CONVERSIONS",
        "MAXIMIZE_CONVERSION_VALUE",
      ];

      if (!supportedStrategies.includes(biddingStrategy)) {
        throw new Error(
          `Google bidding strategy "${biddingStrategy}" is not supported by the current Search creation flow.`,
        );
      }

      const biddingOptions = {
        ...(effectiveGooglePerformanceGoal === "CONVERSIONS" &&
          isPositiveAmount(googleTargetCpa) && {
            targetCpa: Number(googleTargetCpa),
          }),
        ...(effectiveGooglePerformanceGoal === "CONVERSION_VALUE" &&
          isPositiveAmount(googleTargetRoas) && {
            targetRoas: Number(googleTargetRoas),
          }),
      };

      const matchType = googleKeywordMatchType as "BROAD" | "PHRASE" | "EXACT";

      const positiveKeywords = splitValues(googleKeywordLines).map((text) => ({
        text,
        matchType,
      }));

      const negativeKeywords = splitValues(googleNegativeKeywordLines).map(
        (text) => ({
          text,
          matchType,
        }),
      );

      if (executionMode === "LIVE" && usesExampleDomain(googleFinalUrl)) {
        throw new Error(
          "Replace the example.com Google final URL before live execution.",
        );
      }

      providers.googleAds = {
        accountId: connections.googleAds.selectedAccountId!,
        providerObjective: googleMarketingObjective,
        providerCampaignType: "SEARCH",

        configuration: {
          budget: {
            name: `${campaignName.trim()} - Budget`,
            amount: Number(googleDailyBudget),
          },

          campaign: {
            name: campaignName.trim(),
            biddingStrategy,
            ...(Object.keys(biddingOptions).length > 0 && {
              biddingOptions,
            }),
          },

          adGroup: {
            name: googleAdGroupName.trim(),
          },

          keywords: {
            positive: positiveKeywords,
            negative: negativeKeywords,
          },

          locations: geoResources.map((geoTargetConstantResourceName) => ({
            geoTargetConstantResourceName,
          })),

          ad: {
            finalUrl: googleFinalUrl,
            headlines: splitValues(googleSearchHeadlines),
            descriptions: splitValues(googleSearchDescriptions),
            ...(googleSearchPath1.trim() && {
              path1: googleSearchPath1.trim(),
            }),
            ...(googleSearchPath2.trim() && {
              path2: googleSearchPath2.trim(),
            }),
          },
        },
      };
    }

    // --------------------------------------------------
    // META ADS — current global creation flow:
    // single-image website ad
    // --------------------------------------------------
    if (selectedPlatforms.includes("metaAds")) {
      if (
        metaCreativeFormat !== "SINGLE_IMAGE" ||
        metaDestinationType !== "WEBSITE"
      ) {
        throw new Error(
          "The current Meta global creation flow supports SINGLE_IMAGE creatives with a WEBSITE destination only.",
        );
      }

      const metaObjective = metaObjectiveMap[objective];
      const metaCurrency = selectedCurrency(connections.metaAds);
      const pageId = metaPageId.trim();
      const instagramActorId = metaInstagramActorId.trim();
      const hasRealInstagramActorId = isRealMetaId(instagramActorId);
      const metaDestination = metaDestinationUrl.trim() || websiteUrl.trim();

      const metaImageUrl = metaCreativeImageUrl.trim();
      const isHttpsUrl = (value: string) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      };

      if (!isHttpsUrl(metaImageUrl)) {
        throw new Error("Enter a valid HTTPS URL for the Meta creative image.");
      }

      if (!isHttpsUrl(metaDestination)) {
        throw new Error(
          "Enter a valid HTTPS URL for the Meta website destination.",
        );
      }

      const metaPixel = metaPixelId.trim();
      const metaConversionEventValue = metaConversionEvent.trim();

      const hasRealPixel = isRealMetaId(metaPixel);

      const requiresWebsiteConversionPixel = [
        "OFFSITE_CONVERSIONS",
        "VALUE",
      ].includes(effectiveMetaOptimizationGoal);

      // Meta website conversion validation also runs in VALIDATE_ONLY mode.
      if (
        requiresWebsiteConversionPixel &&
        (!hasRealPixel || !metaConversionEventValue)
      ) {
        throw new Error(
          "Meta website conversion optimization requires a real Pixel ID and a conversion event, such as PURCHASE. Enter both before preparing the request.",
        );
      }

      if (executionMode === "LIVE" && pageId === "123456789012345") {
        throw new Error(
          "Replace the placeholder Meta Page ID with a Page ID available to your connected Meta account.",
        );
      }

      if (
        executionMode === "LIVE" &&
        requiresWebsiteConversionPixel &&
        !hasRealPixel
      ) {
        throw new Error(
          "Enter a real Meta Pixel ID for the selected website conversion optimization goal.",
        );
      }

      if (
        executionMode === "LIVE" &&
        (usesExampleDomain(metaDestination) || usesExampleDomain(metaImageUrl))
      ) {
        throw new Error(
          "Replace the example.com Meta image and destination URLs before live execution.",
        );
      }

      const regionKeys = realMetaIds(metaRegionKeys);
      const cityKeys = realMetaIds(metaCityKeys);
      const interestIds = realMetaIds(metaAudienceInterestIds);
      const includedAudienceIds = realMetaIds(metaIncludedCustomAudienceIds);
      const excludedAudienceIds = realMetaIds(metaExcludedCustomAudienceIds);

      const metaStartDate = metaStartTime ? new Date(metaStartTime) : null;

      const metaEndDate = metaEndTime ? new Date(metaEndTime) : null;

      if (metaStartDate && Number.isNaN(metaStartDate.getTime())) {
        throw new Error("Enter a valid Meta start date.");
      }

      if (metaEndDate && Number.isNaN(metaEndDate.getTime())) {
        throw new Error("Enter a valid Meta end date.");
      }

      if (metaStartDate && metaStartDate.getTime() <= Date.now()) {
        throw new Error("Meta campaign start date must be in the future.");
      }

      if (
        metaStartDate &&
        metaEndDate &&
        metaEndDate.getTime() <= metaStartDate.getTime()
      ) {
        throw new Error("Meta end date must be later than the start date.");
      }

      if (metaBudgetMode === "LIFETIME" && !metaEndDate) {
        throw new Error(
          "A Meta Ad Set end date is required for a lifetime budget.",
        );
      }

      const targeting = {
        geo_locations: {
          countries: splitValues(metaCountries).map((code) =>
            code.toUpperCase(),
          ),
          ...(regionKeys.length > 0 && {
            regions: regionKeys.map((key) => ({ key })),
          }),
          ...(cityKeys.length > 0 && {
            cities: cityKeys.map((key) => ({
              key,
              radius: Number(metaCityRadius),
              distance_unit: metaCityDistanceUnit,
            })),
          }),
          ...(splitValues(metaZipKeys).length > 0 && {
            zips: splitValues(metaZipKeys).map((key) => ({
              key: key.toUpperCase(),
            })),
          }),
        },

        ...(metaSpecialAdCategories.length === 0 && {
          age_min: Number(metaAgeMin),
          age_max: Number(metaAgeMax),
          ...(metaGender !== "ALL" && {
            genders: [metaGender === "MEN" ? 1 : 2],
          }),
        }),

        ...(interestIds.length > 0 && {
          flexible_spec: [
            {
              interests: interestIds.map((id) => ({ id })),
            },
          ],
        }),

        ...(includedAudienceIds.length > 0 && {
          custom_audiences: includedAudienceIds.map((id) => ({ id })),
        }),

        ...(excludedAudienceIds.length > 0 && {
          excluded_custom_audiences: excludedAudienceIds.map((id) => ({
            id,
          })),
        }),
      };

      const placements = {
        mode: metaPlacementMode,
        ...(metaPlacementMode === "MANUAL" && {
          publisherPlatforms: metaPublisherPlatforms,
          ...(metaPublisherPlatforms.includes("facebook") && {
            facebookPositions: metaFacebookPositions,
          }),
          ...(metaPublisherPlatforms.includes("instagram") && {
            instagramPositions: metaInstagramPositions,
          }),
          ...(metaPublisherPlatforms.includes("messenger") && {
            messengerPositions: metaMessengerPositions,
          }),
          ...(metaPublisherPlatforms.includes("audience_network") && {
            audienceNetworkPositions: metaAudienceNetworkPositions,
          }),
        }),
      };

      providers.metaAds = {
        accountId: connections.metaAds.selectedAccountId!,
        providerObjective: metaObjective,
        providerCampaignType: "CAMPAIGN",

        configuration: {
          campaign: {
            name: campaignName.trim(),
            objective: metaObjective,
            buyingType: metaBuyingType,
            specialAdCategories: metaSpecialAdCategories,
            budgetLevel: metaBudgetLevel,
            budgetCurrency: metaCurrency,

            ...(metaBudgetLevel === "CAMPAIGN" &&
              metaBudgetMode === "DAILY" && {
                dailyBudgetAmount: Number(metaDailyBudget),
              }),

            ...(metaBudgetLevel === "CAMPAIGN" &&
              metaBudgetMode === "LIFETIME" && {
                lifetimeBudgetAmount: Number(metaLifetimeBudget),
              }),

            ...(metaBudgetLevel === "CAMPAIGN" && {
              bidStrategy: metaBidStrategy,
            }),
          },

          adSet: {
            name: metaAdSetName.trim(),
            campaignObjective: metaObjective,
            optimization_goal: effectiveMetaOptimizationGoal,
            billing_event: effectiveMetaBillingEvent,
            targeting,
            placements,
            budgetLevel: metaBudgetLevel,
            budgetCurrency: metaCurrency,

            ...(metaBudgetLevel === "AD_SET" &&
              metaBudgetMode === "DAILY" && {
                dailyBudgetAmount: Number(metaDailyBudget),
              }),

            ...(metaBudgetLevel === "AD_SET" &&
              metaBudgetMode === "LIFETIME" && {
                lifetimeBudgetAmount: Number(metaLifetimeBudget),
              }),

            ...(metaBudgetLevel === "AD_SET" && {
              bid_strategy: metaBidStrategy,
            }),

            ...(metaBudgetLevel === "AD_SET" &&
              ["LOWEST_COST_WITH_BID_CAP", "COST_CAP"].includes(
                metaBidStrategy,
              ) && {
                bidAmountInput: Number(metaBidAmount),
              }),

            ...(metaBudgetLevel === "AD_SET" &&
              metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && {
                bid_constraints: {
                  roas_average_floor: Math.round(
                    Number(metaMinimumRoas) * 10000,
                  ),
                },
              }),
            ...(metaStartTime && {
              startTime: new Date(metaStartTime).toISOString(),
            }),

            ...(metaEndTime && {
              endTime: new Date(metaEndTime).toISOString(),
            }),

            ...(hasRealPixel && {
              promoted_object: {
                pixel_id: metaPixel,
                ...(metaConversionEventValue && {
                  custom_event_type: metaConversionEventValue,
                }),
              },
            }),

            destinationType: "WEBSITE",
          },

          ad: {
            name: `${metaAdSetName.trim()} - Ad`,
            creativeDraft: {
              format: "SINGLE_IMAGE",
              pageId,
              ...(hasRealInstagramActorId && {
                instagramActorId,
              }),
              primaryText: metaPrimaryText.trim(),
              headline: metaAdHeadline.trim(),
              description: metaAdDescription.trim() || null,
              imageUrl: metaImageUrl,
              destinationUrl: metaDestination,
              callToAction: metaCallToAction,
            },
          },
        },
      };
    }

    return {
      name: campaignName.trim(),
      businessName: businessName.trim(),
      websiteUrl: websiteUrl.trim() || null,
      description: description.trim() || null,
      objective,
      platforms: selectedPlatforms,
      providers,
      execution: {
        validateOnly: executionMode === "VALIDATE_ONLY",
        confirm: executionMode === "LIVE",
      },
    };
  };

  const buildDemoResources = (
    provider: ProviderName,
    scenario: DemoScenario,
    jobSuffix: string,
  ): DemoProviderResult => {
    const isGoogle = provider === "googleAds";
    const middleLabel = isGoogle
      ? googleCampaignType === "PERFORMANCE_MAX"
        ? "Asset Group"
        : googleCampaignType === "HOTEL"
          ? "Hotel Ad Group"
          : googleCampaignType === "APP"
            ? "App Ad Group"
            : "Ad Group"
      : "Ad Set";
    const finalLabel = isGoogle
      ? googleCampaignType === "PERFORMANCE_MAX"
        ? "Asset links"
        : googleCampaignType === "HOTEL"
          ? "Hotel Listing Group"
          : googleCampaignType === "APP"
            ? "App assets"
            : googleCampaignType === "SHOPPING"
              ? "Product listing"
              : googleCampaignType === "SEARCH"
                ? "Responsive Search Ad"
                : googleCampaignType === "DISPLAY"
                  ? "Responsive Display Ad"
                  : "Demand Gen Ad"
      : "Ad";
    const resourceLabels = isGoogle
      ? ["Campaign Budget", "Campaign", middleLabel, finalLabel]
      : ["Campaign", "Ad Set", "Ad Creative", finalLabel];
    const resources: DemoResourceResult[] = resourceLabels.map(
      (label, index) => ({
        key: `${provider}-${index + 1}`,
        label,
        status: "SUCCESS",
        resourceId: `DEMO-${isGoogle ? "GADS" : "META"}-${index + 1}-${jobSuffix}`,
        endpoint: isGoogle
          ? [
              "CampaignBudgetService.MutateCampaignBudgets (or GoogleAdsService.Mutate with a temporary resource name)",
              "CampaignService.MutateCampaigns (references the created CampaignBudget)",
              "AdGroupService.MutateAdGroups or AssetGroupService.MutateAssetGroups",
              "AdGroupAdService.MutateAdGroupAds / AssetGroupAssetService.MutateAssetGroupAssets",
            ][Math.min(index, 3)]
          : [
              "POST /act_{ad_account_id}/campaigns",
              "POST /act_{ad_account_id}/adsets",
              "POST /act_{ad_account_id}/adcreatives",
              "POST /act_{ad_account_id}/ads",
            ][Math.min(index, 3)],
        attemptCount: 1,
        requestId: `REQ-${provider}-${jobSuffix}-${index + 1}`,
        responseSummary:
          "Mock provider response: resource created and identifier returned.",
      }),
    );

    const markFailedFrom = (index: number, code: string, message: string) => {
      resources[index] = {
        ...resources[index],
        status: "FAILED",
        resourceId: null,
        errorCode: code,
        errorMessage: message,
      };
      for (let next = index + 1; next < resources.length; next += 1) {
        resources[next] = {
          ...resources[next],
          status: "NOT_STARTED",
          resourceId: null,
          errorCode: undefined,
          errorMessage: undefined,
        };
      }
    };

    if (scenario === "TIMEOUT") {
      const timeoutIndex = Math.min(1, resources.length - 1);
      resources[timeoutIndex] = {
        ...resources[timeoutIndex],
        status: "TIMED_OUT",
        resourceId: null,
        errorCode: "REQUEST_TIMEOUT_UNKNOWN_OUTCOME",
        errorMessage:
          "The request timed out. The provider may still have created the resource; reconcile by querying the account before retrying.",
        responseSummary:
          "No definitive response received. Creation outcome is unknown.",
      };
      for (let next = timeoutIndex + 1; next < resources.length; next += 1) {
        resources[next] = {
          ...resources[next],
          status: "BLOCKED",
          resourceId: null,
          errorCode: "DEPENDENCY_NOT_CONFIRMED",
          errorMessage:
            "Waiting until the timed-out parent resource is reconciled.",
        };
      }
    } else if (scenario === "ALL_FAILURE") {
      markFailedFrom(
        0,
        isGoogle ? "GOOGLE_ADS_MUTATE_ERROR" : "META_GRAPH_API_ERROR",
        isGoogle
          ? "Demo error: Google Ads rejected the Campaign Budget create operation. The Campaign and its dependent resources were not started."
          : "Demo error: Meta rejected the campaign because of an invalid parameter.",
      );
    } else if (scenario === "PROVIDER_FAILURE" && provider === "metaAds") {
      markFailedFrom(
        0,
        "META_INVALID_PARAMETER",
        "Demo error: the selected optimization goal is incompatible with this billing event.",
      );
    } else if (
      scenario === "PROVIDER_FAILURE" &&
      provider === "googleAds" &&
      !selectedPlatforms.includes("metaAds")
    ) {
      markFailedFrom(
        0,
        "GOOGLE_ADS_INVALID_ARGUMENT",
        "Demo error: one of the selected campaign settings is not valid for this campaign type.",
      );
    } else if (
      scenario === "RESOURCE_FAILURE" &&
      provider ===
        (selectedPlatforms.includes("googleAds") ? "googleAds" : "metaAds")
    ) {
      markFailedFrom(
        isGoogle ? 2 : 1,
        isGoogle ? "AD_GROUP_CREATION_FAILED" : "AD_SET_CREATION_FAILED",
        isGoogle
          ? "Demo error: the Campaign Budget and Campaign were created, but the Ad Group / Asset Group configuration was rejected."
          : "Demo error: the campaign was created, but the Ad Set targeting configuration was rejected.",
      );
    }

    const successCount = resources.filter(
      (resource) => resource.status === "SUCCESS",
    ).length;
    const failedCount = resources.filter(
      (resource) => resource.status === "FAILED",
    ).length;
    const status: DemoProviderStatus =
      successCount === resources.length
        ? "SUCCESS"
        : successCount > 0
          ? "PARTIAL_SUCCESS"
          : failedCount > 0
            ? "FAILED"
            : "PARTIAL_SUCCESS";

    return { provider, status, resources };
  };

  const updateDemoJob = (
    providers: DemoProviderResult[],
    current: DemoCreationJob,
  ) => {
    const providerStatuses = providers.map((provider) => provider.status);
    const overallStatus: DemoOverallStatus = providerStatuses.every(
      (status) => status === "SUCCESS",
    )
      ? "SUCCESS"
      : providerStatuses.every((status) => status === "FAILED")
        ? "FAILED"
        : "PARTIAL_SUCCESS";
    setDemoJob({ ...current, providers, overallStatus });
    setCampaignRecords((records) =>
      records.map((record) =>
        record.jobId === current.jobId
          ? {
              ...record,
              creationStatus: overallStatus,
              updatedAt: new Date().toLocaleString(),
            }
          : record,
      ),
    );
  };

  const runDemoScenario = (scenario: DemoScenario) => {
    if (!preparedPayload) {
      setError(
        "Prepare the unified campaign request before running a creation scenario.",
      );
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError(
        "Select at least one advertising platform before running the demo.",
      );
      return;
    }

    const suffix = String(Date.now()).slice(-6);
    const providers = selectedPlatforms.map((provider) =>
      buildDemoResources(provider, scenario, suffix),
    );
    const statuses = providers.map((provider) => provider.status);
    const overallStatus: DemoOverallStatus = statuses.every(
      (status) => status === "SUCCESS",
    )
      ? "SUCCESS"
      : statuses.every((status) => status === "FAILED")
        ? "FAILED"
        : "PARTIAL_SUCCESS";

    const jobId = `DEMO-JOB-${suffix}`;
    const createdAt = new Date().toLocaleString();
    const recordId = `LOCAL-${jobId}`;
    const groupId = recordId;
    const records: ManagedCampaignRecord[] = selectedPlatforms.map(
      (platform) => {
        const providerResult = providers.find(
          (item) => item.provider === platform,
        );
        const providerStatus = providerResult?.status ?? "FAILED";
        const providerBudget =
          platform === "googleAds"
            ? `Google ${effectiveGoogleBudgetMode === "DAILY" ? googleDailyBudget + "/day" : googleCampaignTotalBudget + " total"}`
            : `Meta ${metaBudgetMode === "DAILY" ? metaDailyBudget + "/day" : metaLifetimeBudget + " lifetime"}`;
        return {
          id: `${recordId}-${platform === "googleAds" ? "GOOGLE" : "META"}`,
          groupId,
          name: campaignName.trim() || "Untitled campaign",
          provider: platform,
          campaignType:
            platform === "googleAds"
              ? `Google ${googleCampaignType}`
              : `Meta ${metaBuyingType}`,
          googleCampaignType:
            platform === "googleAds" ? googleCampaignType : undefined,
          objective: (objective || "SALES") as Objective,
          budgetLabel: providerBudget,
          status:
            providerStatus === "SUCCESS"
              ? "ACTIVE"
              : providerStatus === "FAILED"
                ? "FAILED"
                : "PAUSED",
          creationStatus: providerStatus,
          accountLabel: selectedAccountLabel(connections[platform]),
          createdAt,
          updatedAt: createdAt,
          source: "LOCAL",
          jobId,
        };
      },
    );
    setDemoJob({ jobId, createdAt, scenario, overallStatus, providers });
    setCampaignRecords((current) => [
      ...records,
      ...current.filter(
        (item) =>
          item.groupId !== groupId &&
          item.id !== recordId &&
          !item.id.startsWith(`${recordId}-`),
      ),
    ]);
    setSelectedCampaignId(records[0]?.id ?? recordId);
    setCampaignNotice(
      `${campaignName.trim() || "Untitled campaign"} was added as ${records.length} separate provider campaign record(s), linked under one shared initiative. This is a demo record, not a live provider campaign.`,
    );
    setError("");
  };

  const retryDemoFailedSteps = (providerName: ProviderName) => {
    if (!demoJob) return;
    const suffix = String(Date.now()).slice(-6);
    const providers = demoJob.providers.map((provider) => {
      if (provider.provider !== providerName) return provider;
      const resources = provider.resources.map((resource) =>
        resource.status === "FAILED"
          ? {
              ...resource,
              status: "SUCCESS" as const,
              resourceId: `DEMO-RETRY-${providerName}-${resource.key}-${suffix}`,
              errorCode: undefined,
              errorMessage: undefined,
            }
          : resource,
      );
      const status: DemoProviderStatus = resources.every(
        (resource) => resource.status === "SUCCESS",
      )
        ? "SUCCESS"
        : resources.some((resource) => resource.status === "SUCCESS")
          ? "PARTIAL_SUCCESS"
          : "FAILED";
      return { ...provider, resources, status };
    });
    updateDemoJob(providers, demoJob);
  };

  const reconcileDemoTimeout = (providerName: ProviderName) => {
    if (!demoJob) return;
    const suffix = String(Date.now()).slice(-6);
    const providers = demoJob.providers.map((provider) => {
      if (provider.provider !== providerName) return provider;
      const resources = provider.resources.map((resource) =>
        resource.status === "TIMED_OUT"
          ? {
              ...resource,
              status: "SUCCESS" as const,
              resourceId: `DEMO-RECONCILED-${providerName}-${suffix}`,
              errorCode: undefined,
              errorMessage: undefined,
              responseSummary:
                "Reconciliation lookup found the resource in the provider account; no duplicate create request was sent.",
            }
          : resource.status === "BLOCKED"
            ? {
                ...resource,
                status: "NOT_STARTED" as const,
                errorCode: undefined,
                errorMessage: undefined,
              }
            : resource,
      );
      const status: DemoProviderStatus = resources.every(
        (resource) => resource.status === "SUCCESS",
      )
        ? "SUCCESS"
        : resources.some((resource) => resource.status === "SUCCESS")
          ? "PARTIAL_SUCCESS"
          : "FAILED";
      return { ...provider, resources, status };
    });
    updateDemoJob(providers, demoJob);
  };

  const continueDemoProvider = (providerName: ProviderName) => {
    if (!demoJob) return;
    const suffix = String(Date.now()).slice(-6);
    const providers = demoJob.providers.map((provider) => {
      if (provider.provider !== providerName) return provider;
      const resources = provider.resources.map((resource) =>
        resource.status === "NOT_STARTED"
          ? {
              ...resource,
              status: "SUCCESS" as const,
              resourceId: `DEMO-CONTINUE-${providerName}-${resource.key}-${suffix}`,
            }
          : resource,
      );
      const status: DemoProviderStatus = resources.every(
        (resource) => resource.status === "SUCCESS",
      )
        ? "SUCCESS"
        : resources.some((resource) => resource.status === "SUCCESS")
          ? "PARTIAL_SUCCESS"
          : "FAILED";
      return { ...provider, resources, status };
    });
    updateDemoJob(providers, demoJob);
  };

  const saveCurrentDraft = () => {
    if (!validateBasics() || !validatePlatformSettings()) return;
    const savedAt = new Date().toLocaleString();
    const recordId = `LOCAL-DRAFT-${String(Date.now()).slice(-7)}`;
    const groupId = recordId;
    const draftRecords: ManagedCampaignRecord[] = selectedPlatforms.map(
      (platform) => ({
        id: `${recordId}-${platform === "googleAds" ? "GOOGLE" : "META"}`,
        groupId,
        name: campaignName.trim() || "Untitled campaign",
        provider: platform,
        campaignType:
          platform === "googleAds"
            ? `Google ${googleCampaignType}`
            : `Meta ${metaBuyingType}`,
        googleCampaignType:
          platform === "googleAds" ? googleCampaignType : undefined,
        objective: (objective || "SALES") as Objective,
        budgetLabel:
          platform === "googleAds"
            ? `Google ${effectiveGoogleBudgetMode === "DAILY" ? googleDailyBudget + "/day" : googleCampaignTotalBudget + " total"}`
            : `Meta ${metaBudgetMode === "DAILY" ? metaDailyBudget + "/day" : metaLifetimeBudget + " lifetime"}`,
        status: "DRAFT",
        creationStatus: "DRAFT",
        accountLabel: selectedAccountLabel(connections[platform]),
        createdAt: savedAt,
        updatedAt: savedAt,
        source: "LOCAL",
      }),
    );
    setSavedDraft({
      name: draftRecords[0]?.name ?? "Untitled campaign",
      savedAt,
      step,
    });
    setCampaignRecords((current) => [...draftRecords, ...current]);
    setSelectedCampaignId(draftRecords[0]?.id ?? recordId);
    setCampaignNotice(
      `${draftRecords.length} provider-specific draft record(s) were saved under one shared initiative.`,
    );
    setError("");
    setWorkspaceView("campaign");
  };

  const resumeSavedDraft = () => {
    if (!savedDraft) return;
    setWorkspaceView("builder");
    setStep(savedDraft.step);
    setError("");
  };

  const addAssetToLibrary = () => {
    if (!newAssetName.trim()) {
      setAssetNotice("Enter an asset name.");
      return;
    }
    if (!isValidHttpUrl(newAssetUrl)) {
      setAssetNotice("Enter a valid HTTPS or HTTP asset URL.");
      return;
    }
    const asset: LibraryAsset = {
      id: `ASSET-${String(Date.now()).slice(-7)}`,
      name: newAssetName.trim(),
      kind: newAssetKind,
      url: newAssetUrl.trim(),
      addedAt: new Date().toLocaleString(),
    };
    setAssetLibrary((current) => [asset, ...current]);
    setNewAssetName("");
    setNewAssetUrl("");
    setAssetNotice("Asset added to this prototype library.");
  };

  const deleteLibraryAsset = (assetId: string) => {
    setAssetLibrary((current) =>
      current.filter((asset) => asset.id !== assetId),
    );
    setAssetNotice("Asset removed from this prototype library.");
  };

  const useLibraryAsset = (
    asset: LibraryAsset,
    target:
      | "meta"
      | "pmax-logo"
      | "pmax-landscape"
      | "pmax-square"
      | "pmax-portrait"
      | "google-display"
      | "google-display-square"
      | "demand-gen"
      | "app-image",
  ) => {
    if (target === "meta" && asset.kind === "IMAGE")
      setMetaCreativeImageUrl(asset.url);
    if (target === "pmax-logo" && ["IMAGE", "LOGO"].includes(asset.kind))
      setPmaxLogoUrl(asset.url);
    if (target === "pmax-landscape" && asset.kind === "IMAGE")
      setPmaxLandscapeImageUrl(asset.url);
    if (target === "pmax-square" && asset.kind === "IMAGE")
      setPmaxSquareImageUrl(asset.url);
    if (target === "pmax-portrait" && asset.kind === "IMAGE")
      setPmaxPortraitImageUrl(asset.url);
    if (target === "google-display" && asset.kind === "IMAGE")
      setGoogleDisplayImageUrl(asset.url);
    if (target === "google-display-square" && asset.kind === "IMAGE")
      setGoogleDisplaySquareImageUrl(asset.url);
    if (target === "demand-gen" && asset.kind === "IMAGE") {
      if (googleDemandGenFormat === "CAROUSEL") {
        setGoogleDemandGenCarouselCards(
          `${asset.name} | ${asset.url} | ${websiteUrl.trim() || "https://example.com"}`,
        );
      } else {
        setGoogleDisplayImageUrl(asset.url);
      }
    }
    if (target === "app-image" && asset.kind === "IMAGE")
      setGoogleAppImageUrls((current) =>
        [
          asset.url,
          ...current
            .split(/[\n,]+/)
            .map((value) => value.trim())
            .filter(Boolean),
        ]
          .filter((value, index, values) => values.indexOf(value) === index)
          .slice(0, 20)
          .join("\n"),
      );
    setAssetNotice(
      `${asset.name} selected for ${target.replace("pmax-", "Performance Max ").replaceAll("-", " ")}. Check the required crop and asset rules before publishing.`,
    );
    setWorkspaceView("builder");
    setStep(4);
    clearPreview();
  };

  const applyGoogleCopyPack = (pack: GoogleCreativePack) => {
    if (!selectedPlatforms.includes("googleAds")) {
      setCreativeStudioNotice(
        "Select Google Ads in Campaign Basics before applying Google ad assets.",
      );
      return false;
    }
    if (
      pack.campaignType !== googleCampaignType ||
      (pack.campaignType === "DEMAND_GEN" &&
        pack.subFormat !== googleDemandGenFormat)
    ) {
      setCreativeStudioNotice(
        `This pack was created for Google ${pack.campaignType}${pack.subFormat ? ` / ${pack.subFormat}` : ""}. Match the current campaign type and ad format before reusing it.`,
      );
      return false;
    }

    const headlines = pack.headlines.join("\n");
    const descriptions = pack.descriptions.join("\n");
    if (googleCampaignType === "SEARCH") {
      setGoogleSearchHeadlines(headlines);
      setGoogleSearchDescriptions(descriptions);
    } else if (googleCampaignType === "PERFORMANCE_MAX") {
      setPmaxHeadlines(headlines);
      setPmaxLongHeadline(pack.longHeadlines[0] || "");
      setPmaxDescriptions(descriptions);
    } else if (googleCampaignType === "DISPLAY") {
      setGoogleDisplayHeadlines(pack.headlines.slice(0, 5).join("\n"));
      setGoogleDisplayLongHeadline(pack.longHeadlines[0] || "");
      setGoogleDisplayDescriptions(descriptions);
    } else if (googleCampaignType === "DEMAND_GEN") {
      if (googleDemandGenFormat === "MULTI_ASSET") {
        setGoogleDisplayHeadlines(pack.headlines.slice(0, 5).join("\n"));
        setGoogleDisplayDescriptions(descriptions);
      } else if (googleDemandGenFormat === "CAROUSEL" && pack.imageUrl) {
        setGoogleDemandGenCarouselCards(
          `${pack.headlines[0]} | ${pack.imageUrl} | ${pack.finalUrl}`,
        );
      }
    } else if (googleCampaignType === "APP") {
      setGoogleAppHeadlines(pack.headlines.slice(0, 5).join("\n"));
      setGoogleAppDescriptions(descriptions);
    }
    return true;
  };

  const applyGoogleCreativeVariation = (variation: CreativeVariation) => {
    if (!applyGoogleCopyPack(variation.googlePack)) return;
    const ratio = variation.googleAspectRatio;
    let mediaNote = "";

    if (variation.kind === "IMAGE") {
      if (googleCampaignType === "PERFORMANCE_MAX") {
        if (ratio === "1.91:1")
          setPmaxLandscapeImageUrl(variation.googleMediaUrl);
        else if (ratio === "1:1")
          setPmaxSquareImageUrl(variation.googleMediaUrl);
        else if (ratio === "4:5")
          setPmaxPortraitImageUrl(variation.googleMediaUrl);
        else
          mediaNote =
            "The image ratio does not match a Performance Max image slot. Choose 1.91:1, 1:1 or 4:5; no automatic crop was created.";
      } else if (googleCampaignType === "DISPLAY") {
        if (ratio === "1:1")
          setGoogleDisplaySquareImageUrl(variation.googleMediaUrl);
        else if (ratio === "1.91:1" || ratio === "16:9")
          setGoogleDisplayImageUrl(variation.googleMediaUrl);
        else
          mediaNote =
            "Responsive Display uses landscape and square image slots. This image needs a compatible crop before it can be used.";
      } else if (googleCampaignType === "DEMAND_GEN") {
        if (googleDemandGenFormat === "CAROUSEL") {
          setGoogleDemandGenCarouselCards(
            `${variation.headline} | ${variation.googleMediaUrl} | ${variation.googlePack.finalUrl}`,
          );
        } else if (googleDemandGenFormat === "MULTI_ASSET") {
          if (ratio === "1:1")
            setGoogleDisplaySquareImageUrl(variation.googleMediaUrl);
          else if (ratio === "1.91:1" || ratio === "16:9")
            setGoogleDisplayImageUrl(variation.googleMediaUrl);
          else
            mediaNote =
              "Choose a square or landscape image for this Demand Gen multi-asset concept.";
        } else {
          mediaNote =
            "This Demand Gen format is not a social-post image slot. Choose a compatible image format or use the video/product-feed inputs.";
        }
      } else if (googleCampaignType === "APP") {
        setGoogleAppImageUrls((current) =>
          [
            variation.googleMediaUrl,
            ...current
              .split(/[\n,]+/)
              .map((value) => value.trim())
              .filter(Boolean),
          ]
            .filter((value, index, values) => values.indexOf(value) === index)
            .slice(0, 20)
            .join("\n"),
        );
      } else if (googleCampaignType === "SEARCH") {
        mediaNote =
          "Google Search Responsive Search Ads are text-based. The image was saved to the Asset Library but was not attached to the Search ad.";
      } else if (["SHOPPING", "HOTEL"].includes(googleCampaignType)) {
        mediaNote =
          googleCampaignType === "SHOPPING"
            ? "Shopping ad imagery comes from the linked Merchant Center product feed; this generic image was not attached to the feed."
            : "Hotel ads use eligible Hotel Center property/listing data; this social-style image was not attached to a Hotel ad.";
      }
    } else {
      mediaNote =
        ["PERFORMANCE_MAX", "DISPLAY", "APP"].includes(googleCampaignType) ||
        (googleCampaignType === "DEMAND_GEN" &&
          googleDemandGenFormat === "VIDEO_RESPONSIVE")
          ? "The video concept is only a demo reference. This Google format requires an uploaded / YouTube-hosted video asset ID; an example MP4 URL cannot be used as that ID."
          : googleCampaignType === "SEARCH"
            ? "Google Search Responsive Search Ads are text-based. This video was saved as a reusable library concept, not attached to the Search ad."
            : googleCampaignType === "SHOPPING"
              ? "Shopping product visuals come from the Merchant Center feed; this video concept was not attached to the product feed."
              : googleCampaignType === "HOTEL"
                ? "Hotel ads use Hotel Center property and price data; this video concept was not attached to the listing."
                : "This selected Google ad format does not take a standalone video post. Choose the video-responsive format and provide a hosted video ID if supported.";
    }

    const googleVisualCanMap =
      variation.kind === "IMAGE" &&
      ((googleCampaignType === "PERFORMANCE_MAX" &&
        ["1.91:1", "1:1", "4:5"].includes(ratio)) ||
        (googleCampaignType === "DISPLAY" &&
          ["1.91:1", "1:1", "16:9"].includes(ratio)) ||
        (googleCampaignType === "APP" &&
          ["1:1", "4:5", "9:16", "16:9"].includes(ratio)) ||
        (googleCampaignType === "DEMAND_GEN" &&
          ["MULTI_ASSET", "CAROUSEL"].includes(googleDemandGenFormat) &&
          ["1.91:1", "1:1", "4:5"].includes(ratio)));
    const googleCopyCanMap =
      ["SEARCH", "PERFORMANCE_MAX", "DISPLAY", "APP"].includes(
        googleCampaignType,
      ) ||
      (googleCampaignType === "DEMAND_GEN" &&
        ["MULTI_ASSET", "CAROUSEL"].includes(googleDemandGenFormat) &&
        variation.kind === "IMAGE");

    if (variation.kind === "IMAGE" && googleVisualCanMap) {
      const googleMediaAssetId = `${variation.id}-GOOGLE-MEDIA`;
      const googleMediaAsset: LibraryAsset = {
        id: googleMediaAssetId,
        name: `${variation.name} · Google ${googleCampaignType} · ${variation.googleAspectRatio}`,
        kind: "IMAGE",
        url: variation.googleMediaUrl,
        addedAt: new Date().toLocaleString(),
        origin: "AI_STUDIO",
        prompt: variation.prompt,
        aspectRatio: variation.googleAspectRatio,
        platformTargets: ["googleAds"],
      };
      setAssetLibrary((current) =>
        current.some((asset) => asset.id === googleMediaAssetId)
          ? current
          : [googleMediaAsset, ...current],
      );
      if (googleVisualCanMap) {
        setAttachedCreativeAssetIds((current) =>
          current.includes(googleMediaAssetId)
            ? current
            : [...current, googleMediaAssetId],
        );
      }
    }

    const copyAssetId = `${variation.id}-GOOGLE-COPY`;
    const copyAsset: LibraryAsset = {
      id: copyAssetId,
      name: `${variation.name} · Google ${variation.googlePack.formatLabel}`,
      kind: "TEXT",
      url: "",
      addedAt: new Date().toLocaleString(),
      origin: "AI_STUDIO",
      platformTargets: ["googleAds"],
      googlePack: variation.googlePack,
    };
    setAssetLibrary((current) =>
      current.some((asset) => asset.id === copyAssetId)
        ? current
        : [copyAsset, ...current],
    );
    if (googleCopyCanMap) {
      setAttachedCreativeAssetIds((current) =>
        current.includes(copyAssetId) ? current : [...current, copyAssetId],
      );
    }

    setCreativeStudioNotice(
      `${googleCopyCanMap ? `Google ${variation.googlePack.formatLabel} assets applied to the ${googleCampaignType} draft.` : `This ${variation.googlePack.formatLabel} concept was saved to the Asset Library; this format is driven by feed / listing data or a separately hosted video, so the demo text pack was not applied to campaign fields.`}${mediaNote ? ` ${mediaNote}` : ""}`,
    );
    setWorkspaceView("builder");
    setStep(4);
    clearPreview();
  };

  const useGoogleCopyAsset = (asset: LibraryAsset) => {
    if (!asset.googlePack) return;
    if (!applyGoogleCopyPack(asset.googlePack)) return;
    setAssetNotice(
      `${asset.name} applied to the Google ${googleCampaignType} draft.`,
    );
    setWorkspaceView("builder");
    setStep(4);
    clearPreview();
  };

  const generateCreativeVariations = () => {
    const prompt = creativePrompt.trim();
    if (!prompt) {
      setCreativeStudioNotice(
        "Enter a creative brief before generating variations.",
      );
      return;
    }

    const now = Date.now();
    const headlinesByVariation = [
      [
        "Shop the Summer Collection",
        "Discover New Arrivals",
        "Seasonal Offers Online",
        "Explore Quality Products",
        "Find Your New Favourites",
      ],
      [
        "Fresh Finds for Brighter Days",
        "Explore the Latest Collection",
        "Shop New Season Styles",
        "Discover Something New",
        "Easy Online Shopping",
      ],
      [
        "Make This Season Yours",
        "Find Your Summer Favourites",
        "Special Offers Online",
        "Shop the Collection Today",
        "Quality Picks for Every Day",
      ],
    ];
    const descriptionsByVariation = [
      [
        "Discover seasonal favourites and shop the latest collection online today.",
        "Explore quality products with convenient online shopping and delivery.",
        "Find fresh arrivals and seasonal offers at Acme Demo Store.",
      ],
      [
        "Explore new arrivals and find pieces selected for the season.",
        "Shop online for everyday favourites and special seasonal offers.",
        "Discover a simple way to refresh your collection today.",
      ],
      [
        "Find your next favourite in the latest collection from Acme Demo Store.",
        "Browse seasonal picks and shop online with convenient delivery.",
        "Explore fresh styles and offers made for the season.",
      ],
    ];
    const longHeadlines = [
      "Explore the summer collection and discover new arrivals at Acme Demo Store",
      "Find seasonal favourites and shop the latest collection online today",
      "Discover quality products, fresh arrivals and special seasonal offers",
    ];
    const formatLabel =
      googleCampaignType === "SEARCH"
        ? "Responsive Search Ad (RSA)"
        : googleCampaignType === "PERFORMANCE_MAX"
          ? "Performance Max Asset Group"
          : googleCampaignType === "DISPLAY"
            ? "Responsive Display Ad"
            : googleCampaignType === "DEMAND_GEN"
              ? `Demand Gen ${googleDemandGenFormat.replaceAll("_", " ")}`
              : googleCampaignType === "APP"
                ? "App Campaign Asset Set"
                : googleCampaignType === "SHOPPING"
                  ? "Merchant Center Product Feed"
                  : googleCampaignType === "HOTEL"
                    ? "Hotel Center Listing Workflow"
                    : `${googleCampaignType} creative assets`;
    const googleFinalUrl =
      googleCampaignType === "SEARCH"
        ? googleSearchFinalUrl
        : googleCampaignType === "PERFORMANCE_MAX"
          ? pmaxFinalUrl
          : googleCampaignType === "DISPLAY"
            ? googleDisplayFinalUrl
            : websiteUrl;
    const styleLabels = [
      creativeStyle,
      `${creativeStyle} · Minimal`,
      `${creativeStyle} · Bold`,
    ];

    const variations: CreativeVariation[] = [0, 1, 2].map((index) => ({
      id: `CREATIVE-${now}-${index + 1}`,
      name: `${creativeKind === "IMAGE" ? "Image" : "Video"} concept ${index + 1}`,
      kind: creativeKind,
      prompt,
      headline: [
        "Your Summer. Your Style.",
        "Fresh Finds for Brighter Days",
        "Make This Season Yours",
      ][index],
      primaryText: [
        "Discover the latest collection and find your new seasonal favourites.",
        "Explore fresh arrivals, standout choices and a little more summer inspiration.",
        "Refresh your routine with carefully selected pieces from our latest collection.",
      ][index],
      callToAction: "SHOP_NOW",
      aspectRatio: creativeAspectRatio,
      googleAspectRatio: googleCreativeAspectRatio,
      googleMediaUrl: `https://example.com/creative-studio/demo-${now}-${index + 1}-google-${googleCreativeAspectRatio.replaceAll(":", "-")}.${creativeKind === "IMAGE" ? "jpg" : "mp4"}`,
      styleLabel: styleLabels[index],
      previewLabel: [
        "Hero product story",
        "Lifestyle edit",
        "Offer-led concept",
      ][index],
      url: `https://example.com/creative-studio/demo-${now}-${index + 1}.${creativeKind === "IMAGE" ? "jpg" : "mp4"}`,
      generatedAt: new Date(now).toLocaleString(),
      googlePack: {
        campaignType: googleCampaignType,
        subFormat:
          googleCampaignType === "DEMAND_GEN"
            ? googleDemandGenFormat
            : undefined,
        formatLabel,
        headlines: headlinesByVariation[index],
        longHeadlines: [longHeadlines[index]],
        descriptions: descriptionsByVariation[index],
        finalUrl: isValidHttpUrl(googleFinalUrl)
          ? googleFinalUrl
          : websiteUrl || "https://example.com",
        imageUrl:
          creativeKind === "IMAGE"
            ? `https://example.com/creative-studio/demo-${now}-${index + 1}-google-${googleCreativeAspectRatio.replaceAll(":", "-")}.jpg`
            : undefined,
      },
    }));

    setCreativeVariations(variations);
    setSelectedCreativeId(variations[0].id);
    setCreativeStudioNotice(
      selectedPlatforms.includes("googleAds")
        ? `Three demo concepts created with a ${formatLabel} text-asset pack. Google output is adapted to the selected campaign type, not rendered as a social post. No AI provider was called and no media file was generated.`
        : "Three demo social creative concepts created locally. No AI provider was called and no media file was generated.",
    );
  };

  const attachCreativeToCampaign = (
    variation: CreativeVariation,
    target: "ALL" | "META" | "GOOGLE" = "ALL",
  ) => {
    const attachMeta =
      target !== "GOOGLE" && selectedPlatforms.includes("metaAds");
    const attachGoogle =
      target !== "META" && selectedPlatforms.includes("googleAds");
    const existing = assetLibrary.find((asset) => asset.id === variation.id);
    if (!existing) {
      const asset: LibraryAsset = {
        id: variation.id,
        name: variation.name,
        kind: variation.kind,
        url: variation.url,
        addedAt: new Date().toLocaleString(),
        origin: "AI_STUDIO",
        prompt: variation.prompt,
        aspectRatio: variation.aspectRatio,
        platformTargets: [
          ...(attachMeta ? (["metaAds"] as ProviderName[]) : []),
          ...(attachGoogle ? (["googleAds"] as ProviderName[]) : []),
        ],
      };
      setAssetLibrary((current) => [asset, ...current]);
    }

    if (attachMeta) {
      setAttachedCreativeAssetIds((current) =>
        current.includes(variation.id) ? current : [...current, variation.id],
      );
    }

    if (attachMeta) {
      if (variation.kind === "IMAGE") {
        setMetaCreativeFormat("SINGLE_IMAGE");
        setMetaCreativeImageUrl(variation.url);
        setMetaAdHeadline(variation.headline);
        setMetaPrimaryText(variation.primaryText);
      } else {
        setMetaCreativeFormat("SINGLE_VIDEO");
      }
    }

    if (attachGoogle) {
      applyGoogleCreativeVariation(variation);
      return;
    }

    const platformLabel = attachMeta ? "Meta Ads" : "your campaign draft";
    setCreativeStudioNotice(
      variation.kind === "IMAGE"
        ? `${variation.name} added to the Asset Library and attached to ${platformLabel}. The URL is a demo reference, not an uploaded media file.`
        : `${variation.name} added to the Asset Library. A real video file must be generated, reviewed and uploaded before publishing.`,
    );
    setWorkspaceView("builder");
    setStep(4);
    clearPreview();
  };

  const toggleManagedStatus = (resourceKey: string) => {
    setManagedStatuses((current) => ({
      ...current,
      [resourceKey]: current[resourceKey] === "ACTIVE" ? "PAUSED" : "ACTIVE",
    }));
  };

  const duplicateManagedDraft = (
    resourceLabel: string,
    resourceKey: string,
  ) => {
    setDuplicatedDrafts((current) => [
      ...current,
      `${resourceLabel} copy (${resourceKey})`,
    ]);
  };

  const toggleCampaignLifecycle = (record: ManagedCampaignRecord) => {
    if (record.status !== "ACTIVE" && record.status !== "PAUSED") return;
    const nextStatus = record.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setCampaignRecords((records) =>
      records.map((item) =>
        item.id === record.id
          ? {
              ...item,
              status: nextStatus,
              updatedAt: new Date().toLocaleString(),
            }
          : item,
      ),
    );
    setCampaignNotice(
      `${record.name} was ${nextStatus === "PAUSED" ? "paused" : "resumed"} in the local prototype only. No provider API request was sent.`,
    );
  };

  const duplicateCampaignRecord = (record: ManagedCampaignRecord) => {
    const createdAt = new Date().toLocaleString();
    const copy: ManagedCampaignRecord = {
      ...record,
      id: `LOCAL-COPY-${String(Date.now()).slice(-7)}`,
      name: `${record.name} (Copy)`,
      status: "DRAFT",
      creationStatus: "DRAFT",
      createdAt,
      updatedAt: createdAt,
      source: "LOCAL",
      jobId: undefined,
    };
    setCampaignRecords((records) => [copy, ...records]);
    setSelectedCampaignId(copy.id);
    setCampaignNotice(`${copy.name} was created as a local draft copy.`);
  };

  const archiveCampaignRecord = (record: ManagedCampaignRecord) => {
    setCampaignRecords((records) =>
      records.map((item) =>
        item.id === record.id
          ? {
              ...item,
              status: "ARCHIVED",
              updatedAt: new Date().toLocaleString(),
            }
          : item,
      ),
    );
    setCampaignNotice(
      `${record.name} was archived in this prototype. The provider campaign was not changed.`,
    );
  };

  const editCampaignRecord = (record: any) => {
    setCampaignName(record.name);
    setObjective(record[`objective`]);
    if (record.provider === "both") {
      setSelectedPlatforms(["googleAds", "metaAds"]);
    } else {
      setSelectedPlatforms([record.provider]);
    }
    if (record.googleCampaignType)
      setGoogleCampaignType(record.googleCampaignType);
    setWorkspaceView("builder");
    setStep(1);
    setError("");
    clearPreview();
    setCampaignNotice(
      `${record.name} was loaded as a starting brief. Review platform settings before preparing a new request.`,
    );
  };

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(preparedPayload);
      setCopyNotice("Request JSON copied.");
      setError("");
    } catch {
      setError("Unable to copy the request. Please copy it manually.");
    }
  };

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelClass = "text-sm font-semibold text-slate-700";
  const selectedObjective = objectives.find((item) => item.value === objective);

  const filteredCampaignRecords = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase();
    return campaignRecords.filter((record: any) => {
      const matchesQuery =
        !query ||
        [
          record.name,
          record.id,
          record.campaignType,
          record.objective,
          record.accountLabel,
        ].some((value) => value.toLowerCase().includes(query));
      const matchesPlatform =
        campaignPlatformFilter === "ALL" ||
        (campaignPlatformFilter === "GOOGLE" &&
          record.provider === "googleAds") ||
        (campaignPlatformFilter === "META" && record.provider === "metaAds") ||
        (campaignPlatformFilter === "BOTH" && record.provider === "both");
      const matchesStatus =
        campaignStatusFilter === "ALL" ||
        record.status === campaignStatusFilter;
      return matchesQuery && matchesPlatform && matchesStatus;
    });
  }, [
    campaignRecords,
    campaignSearch,
    campaignPlatformFilter,
    campaignStatusFilter,
  ]);

  const selectedCampaign =
    campaignRecords.find((record) => record.id === selectedCampaignId) ??
    campaignRecords[0] ??
    null;

  const campaignMetrics = useMemo(
    () => ({
      total: campaignRecords.filter((record) => record.status !== "ARCHIVED")
        .length,
      active: campaignRecords.filter((record) => record.status === "ACTIVE")
        .length,
      paused: campaignRecords.filter((record) => record.status === "PAUSED")
        .length,
      drafts: campaignRecords.filter((record) => record.status === "DRAFT")
        .length,
      attention: campaignRecords.filter((record) => record.status === "FAILED")
        .length,
    }),
    [campaignRecords],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <p className="text-sm font-semibold text-blue-600">
          Campaign Management
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Unified Campaign Builder
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Create one campaign brief and configure Google Ads, Meta Ads, or both
          from the same workflow.
        </p>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Demo data is prefilled.</strong> Sample names, budgets, copy,
          URLs and placeholder IDs are included to help you explore every form
          section. Replace all sample IDs, assets, targeting values and
          account-specific settings with real values before using any provider
          payload. This prototype prepares a request preview and does not send
          campaign mutations.
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            { value: "builder", label: "Campaign Builder", icon: "＋" },
            { value: "ads", label: "Ad Management", icon: "◫" },
            { value: "assets", label: "Asset Library", icon: "▧" },
            { value: "creative", label: "AI Creative Studio", icon: "✦" },
          ] as { value: WorkspaceView; label: string; icon: string }[]
        ).map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setWorkspaceView(item.value);
              setError("");
            }}
            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${workspaceView === item.value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"}`}
          >
            <span className="mr-2">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {workspaceView === "builder" && (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { number: 1, label: "Campaign Basics" },
            { number: 2, label: "Platform Settings" },
            { number: 3, label: "Ad Groups / Ad Sets" },
            { number: 4, label: "Ad Creation & Assets" },
            { number: 5, label: "Review & Create" },
          ].map((item) => (
            <div key={item.number}>
              <div
                className={`h-1.5 rounded-full ${step >= item.number ? "bg-blue-600" : "bg-slate-200"}`}
              />
              <p
                className={`mt-2 text-xs font-semibold sm:text-sm ${step === item.number ? "text-blue-700" : "text-slate-400"}`}
              >
                {item.number}. {item.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {loadingConnections && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
          Loading your advertising accounts...
        </div>
      )}

      {connectionError && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {connectionError}
          <div className="mt-2">
            <Link
              href="/dashboard/provider"
              className="font-semibold underline"
            >
              Manage account connections
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {workspaceView === "builder" && step === 1 && (
        <section className="mt-8 space-y-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">1. Choose where to advertise</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose one platform or select Both to prepare campaigns for Google
              and Meta together.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(
                [
                  {
                    mode: "googleAds",
                    title: "Google Ads",
                    description:
                      "Search, Display, Demand Gen, Performance Max, Shopping, Hotel and App",
                    ready: googleReady,
                  },
                  {
                    mode: "metaAds",
                    title: "Meta Ads",
                    description: "Facebook and Instagram",
                    ready: metaReady,
                  },
                  {
                    mode: "both",
                    title: "Both Platforms",
                    description: "One brief, separate provider settings",
                    ready: bothReady,
                  },
                ] as const
              ).map((option) => {
                const active = platformMode === option.mode;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    disabled={!option.ready || loadingConnections}
                    onClick={() => choosePlatformMode(option.mode)}
                    className={`rounded-xl border p-4 text-left transition ${
                      active
                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                        : "border-slate-200 hover:border-blue-300"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">
                        {option.title}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-blue-600 text-white" : option.ready ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        {active
                          ? "Selected"
                          : option.ready
                            ? "Connected"
                            : "Unavailable"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    key: "googleAds",
                    title: "Google Ads",
                    ready: googleReady,
                    connection: connections.googleAds,
                  },
                  {
                    key: "metaAds",
                    title: "Meta Ads",
                    ready: metaReady,
                    connection: connections.metaAds,
                  },
                ] as const
              ).map((platform) => (
                <div
                  key={platform.key}
                  className="rounded-xl bg-slate-50 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      {platform.title}
                    </span>
                    <span
                      className={
                        platform.ready ? "text-green-700" : "text-slate-500"
                      }
                    >
                      {platform.ready ? "Account ready" : "Account not ready"}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs text-slate-500">
                    {platform.ready
                      ? selectedAccountLabel(platform.connection)
                      : "Connect and select an account first."}
                  </p>
                  {platform.ready && (
                    <p className="mt-1 text-xs text-slate-500">
                      Currency: {selectedCurrency(platform.connection)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {!loadingConnections && (
              <Link
                href="/dashboard/provider"
                className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:text-blue-800"
              >
                Manage advertising accounts →
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">2. Shared campaign brief</h2>
            <p className="mt-1 text-sm text-slate-500">
              These details are reused across the platforms you selected.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Business Name *</label>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. ABC Technologies"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Campaign Name *</label>
                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. October Product Launch"
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Website URL</label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://www.example.com"
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Campaign Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your product, offer or campaign..."
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">
              3. What is your campaign objective?
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose the business outcome. The selected objective is mapped to
              each provider's own campaign model.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {objectives.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setObjective(item.value);
                    setGoogleMarketingObjective(
                      googleObjectiveFromShared[item.value],
                    );
                    clearPreview();
                  }}
                  className={`rounded-xl border p-4 text-left transition ${objective === item.value ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}
                >
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className="mt-2 block text-xs leading-5 text-slate-500">
                    {item.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {workspaceView === "builder" && step === 2 && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold">Provider-specific settings</h2>
            <p className="mt-1 text-sm text-slate-500">
              Each platform has its own campaign structure, bidding and budget
              configuration.
            </p>
          </div>

          {selectedPlatforms.includes("googleAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-blue-700">
                  G
                </div>
                <div>
                  <h3 className="font-bold">Google Ads</h3>
                  <p className="text-xs text-slate-500">
                    {selectedAccountLabel(connections.googleAds)} ·{" "}
                    {selectedCurrency(connections.googleAds)}
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    Google Marketing Objective *
                  </label>
                  <select
                    value={googleMarketingObjective}
                    onChange={(e) => {
                      setGoogleMarketingObjective(
                        e.target.value as GoogleMarketingObjective,
                      );
                      clearPreview();
                    }}
                    className={inputClass}
                  >
                    {googleMarketingObjectiveOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    This is a builder-level goal preset used to guide campaign
                    setup; Google Ads does not have one universal campaign
                    objective field.
                  </p>
                  {googleMarketingObjective === "LOCAL_STORES_VISITS" && (
                    <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Local store goals require an eligible Performance Max
                      setup, linked location assets and suitable store
                      conversion goals.
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>
                    EU Political Advertising Declaration *
                  </label>
                  <select
                    value={googleEuPoliticalStatus}
                    onChange={(e) => {
                      setGoogleEuPoliticalStatus(
                        e.target.value as GoogleEuPoliticalStatus,
                      );
                      clearPreview();
                    }}
                    className={inputClass}
                  >
                    <option value="">Select a declaration</option>
                    <option value="DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING">
                      Does not contain EU political advertising
                    </option>
                    <option value="CONTAINS_EU_POLITICAL_ADVERTISING">
                      Contains EU political advertising
                    </option>
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    Google Ads API v26 requires this declaration when creating a
                    campaign. Select the answer that accurately describes the
                    campaign.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Google Campaign Type *</label>
                  <select
                    value={googleCampaignType}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      const nextGoals =
                        googlePerformanceGoalsByType[nextType] ||
                        googlePerformanceGoalsByType.SEARCH;
                      setGoogleCampaignType(nextType);
                      setGoogleCreativeAspectRatio(
                        ["PERFORMANCE_MAX", "DISPLAY"].includes(nextType)
                          ? "1.91:1"
                          : "1:1",
                      );
                      if (
                        ![
                          "SEARCH",
                          "PERFORMANCE_MAX",
                          "DEMAND_GEN",
                          "SHOPPING",
                        ].includes(nextType)
                      )
                        setGoogleBudgetMode("DAILY");
                      if (
                        !["SEARCH", "PERFORMANCE_MAX", "SHOPPING"].includes(
                          nextType,
                        )
                      )
                        setGoogleBiddingScope("STANDARD");
                      if (
                        !nextGoals.some(
                          (item) => item.value === googlePerformanceGoal,
                        )
                      ) {
                        setGooglePerformanceGoal(nextGoals[0].value);
                      }
                      if (nextType !== "SEARCH" && nextType !== "DISPLAY") {
                        setGoogleBiddingMode("AUTOMATED");
                      }
                      clearPreview();
                    }}
                    className={inputClass}
                  >
                    {googleCampaignTypes.map((item) => (
                      <option
                        key={item.value}
                        value={item.value}
                        disabled={Boolean(item.disabled)}
                      >
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                {googleCampaignType !== "APP" &&
                  googleCampaignType !== "HOTEL" && (
                    <div>
                      <label className={labelClass}>Performance Goal *</label>
                      <select
                        value={effectiveGooglePerformanceGoal}
                        onChange={(e) => {
                          setGooglePerformanceGoal(
                            e.target.value as GooglePerformanceGoal,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        {availableGooglePerformanceGoals.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-slate-500">
                        A builder-level goal mapped to a valid Google bidding
                        scheme. Google Ads has no universal
                        campaign.performance_goal field.
                      </p>
                      {selectedGooglePerformanceConfig && (
                        <p className="mt-1 text-xs font-medium text-slate-600">
                          Recommended API bidding strategy:{" "}
                          {effectiveGoogleBiddingStrategy}
                        </p>
                      )}
                    </div>
                  )}

                {(googleCampaignType === "SEARCH" ||
                  googleCampaignType === "DISPLAY") && (
                  <div>
                    <label className={labelClass}>Bidding Method *</label>
                    <select
                      value={effectiveGoogleBiddingMode}
                      onChange={(e) => {
                        const nextMode = e.target.value as GoogleBiddingMode;
                        setGoogleBiddingMode(nextMode);
                        if (nextMode !== "AUTOMATED")
                          setGoogleBiddingScope("STANDARD");
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="AUTOMATED">
                        Automated (based on Performance Goal)
                      </option>
                      <option value="MANUAL_CPC">Manual CPC</option>
                      {googleCampaignType === "DISPLAY" && (
                        <option value="MANUAL_CPM">Manual CPM</option>
                      )}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Manual CPC/CPM uses an Ad Group-level bid in the Google
                      Ads API. Manual CPM is only shown for Display. Manual CPV
                      is not offered because new Video campaign creation is not
                      supported through this API workflow.
                    </p>
                  </div>
                )}
                {googlePortfolioStrategyEligible &&
                  effectiveGoogleBiddingMode === "AUTOMATED" && (
                    <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                      <label className={labelClass}>
                        Google Bidding Strategy Scope *
                      </label>
                      <select
                        value={effectiveGoogleBiddingScope}
                        onChange={(e) => {
                          setGoogleBiddingScope(
                            e.target.value as GoogleBiddingScope,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="STANDARD">
                          Standard strategy (configured on this Campaign)
                        </option>
                        <option value="PORTFOLIO">
                          Use an existing portfolio strategy
                        </option>
                      </select>
                      {effectiveGoogleBiddingScope === "PORTFOLIO" ? (
                        <div className="mt-3">
                          <label className={labelClass}>
                            Portfolio Bidding Strategy Resource Name *
                          </label>
                          <input
                            value={googlePortfolioStrategyResourceName}
                            onChange={(e) => {
                              setGooglePortfolioStrategyResourceName(
                                e.target.value,
                              );
                              clearPreview();
                            }}
                            placeholder="customers/123456/biddingStrategies/789"
                            className={inputClass}
                          />
                          <p className="mt-2 text-xs text-slate-500">
                            The referenced portfolio strategy must already exist
                            in this Google Ads customer. The backend must verify
                            its bidding scheme and campaign-type compatibility
                            before linking Campaign.bidding_strategy.
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">
                          Standard strategies are sent through the Campaign
                          campaign_bidding_strategy union. Portfolio strategies
                          are separate BiddingStrategy resources and are
                          referenced by resource name.
                        </p>
                      )}
                    </div>
                  )}

                {["SEARCH", "PERFORMANCE_MAX"].includes(googleCampaignType) &&
                  effectiveGooglePerformanceGoal === "CONVERSIONS" &&
                  effectiveGoogleBiddingMode === "AUTOMATED" && (
                    <div>
                      <label className={labelClass}>
                        Optional Target CPA (
                        {selectedCurrency(connections.googleAds)})
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={googleTargetCpa}
                        onChange={(e) => {
                          setGoogleTargetCpa(e.target.value);
                          clearPreview();
                        }}
                        placeholder="Leave blank to maximize conversions"
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Available for Search and Performance Max. The backend
                        maps this to the optional target CPA on Maximize
                        Conversions.
                      </p>
                    </div>
                  )}
                {effectiveGooglePerformanceGoal === "CONVERSION_VALUE" &&
                  googleCampaignType !== "APP" &&
                  googleCampaignType !== "HOTEL" &&
                  effectiveGoogleBiddingMode === "AUTOMATED" && (
                    <div>
                      <label className={labelClass}>Optional Target ROAS</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.1"
                        value={googleTargetRoas}
                        onChange={(e) => {
                          setGoogleTargetRoas(e.target.value);
                          clearPreview();
                        }}
                        placeholder="e.g. 3.0 = 300%"
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Enter a ratio (3.0 means 300%). The backend passes this
                        as the target ROAS parameter.
                      </p>
                    </div>
                  )}
                {effectiveGooglePerformanceGoal === "IMPRESSION_SHARE" &&
                  googleCampaignType === "SEARCH" &&
                  effectiveGoogleBiddingMode === "AUTOMATED" && (
                    <>
                      <div>
                        <label className={labelClass}>
                          Target Search Placement
                        </label>
                        <select
                          value={googleImpressionShareLocation}
                          onChange={(e) => {
                            setGoogleImpressionShareLocation(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        >
                          <option value="ANYWHERE_ON_PAGE">
                            Anywhere on results page
                          </option>
                          <option value="TOP_OF_PAGE">
                            Top of results page
                          </option>
                          <option value="ABSOLUTE_TOP_OF_PAGE">
                            Absolute top of results page
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Target Impression Share (%)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={googleImpressionSharePercent}
                          onChange={(e) => {
                            setGoogleImpressionSharePercent(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Maximum CPC Bid Ceiling (
                          {selectedCurrency(connections.googleAds)})
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={googleImpressionShareMaxCpc}
                          onChange={(e) => {
                            setGoogleImpressionShareMaxCpc(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}

                {googleCampaignType === "SHOPPING" && (
                  <>
                    <div>
                      <label className={labelClass}>
                        Merchant Center Account ID *
                      </label>
                      <input
                        inputMode="numeric"
                        value={googleMerchantCenterId}
                        onChange={(e) => {
                          setGoogleMerchantCenterId(e.target.value);
                          clearPreview();
                        }}
                        placeholder="Linked Merchant Center account ID"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Shopping Campaign Priority *
                      </label>
                      <select
                        value={googleShoppingPriority}
                        onChange={(e) => {
                          setGoogleShoppingPriority(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="0">Low (0)</option>
                        <option value="1">Medium (1)</option>
                        <option value="2">High (2)</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Feed Label (optional)
                      </label>
                      <input
                        value={googleShoppingFeedLabel}
                        onChange={(e) => {
                          setGoogleShoppingFeedLabel(e.target.value);
                          clearPreview();
                        }}
                        placeholder="IN"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Product Listing Group
                      </label>
                      <select
                        value={googleShoppingProductGroupType}
                        onChange={(e) => {
                          setGoogleShoppingProductGroupType(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="ALL_PRODUCTS">All products</option>
                        <option value="BRAND">Brand</option>
                        <option value="PRODUCT_TYPE">Product type</option>
                        <option value="CUSTOM_LABEL_0">Custom label 0</option>
                        <option value="ITEM_ID">Item ID</option>
                      </select>
                    </div>
                    {googleShoppingProductGroupType !== "ALL_PRODUCTS" && (
                      <div>
                        <label className={labelClass}>
                          Product group value *
                        </label>
                        <input
                          value={googleShoppingProductGroupValue}
                          onChange={(e) => {
                            setGoogleShoppingProductGroupValue(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                    )}
                    <p className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Standard Shopping requires a linked Merchant Center
                      account and shopping_setting. The API adapter must create
                      the product listing-group tree under the Ad Group. Smart
                      Shopping is not offered; use Performance Max instead.
                    </p>
                  </>
                )}

                {googleCampaignType === "DEMAND_GEN" && (
                  <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-800">
                      Demand Gen channel controls
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      These controls belong to the Ad Group, not
                      campaign.network_settings.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["youtube_in_feed", "YouTube In-Feed"],
                          ["youtube_in_stream", "YouTube In-Stream"],
                          ["youtube_shorts", "YouTube Shorts"],
                          ["discover", "Discover"],
                          ["gmail", "Gmail"],
                          ["display", "Display"],
                          ["maps", "Maps"],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={demandGenChannels[key]}
                            onChange={(e) => {
                              setDemandGenChannels((current) => ({
                                ...current,
                                [key]: e.target.checked,
                              }));
                              clearPreview();
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {googleCampaignType === "HOTEL" && (
                  <>
                    <div>
                      <label className={labelClass}>
                        Hotel Center Account ID *
                      </label>
                      <input
                        inputMode="numeric"
                        value={googleHotelCenterId}
                        onChange={(e) => {
                          setGoogleHotelCenterId(e.target.value);
                          clearPreview();
                        }}
                        placeholder="Linked Hotel Center account ID"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Hotel Bidding Strategy *
                      </label>
                      <select
                        value={googleHotelBidStrategy}
                        onChange={(e) => {
                          setGoogleHotelBidStrategy(
                            e.target.value as GoogleHotelBidStrategy,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="PERCENT_CPC">Percent CPC</option>
                        <option value="MANUAL_CPC">Manual CPC</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>
                        CPC Bid Ceiling (
                        {selectedCurrency(connections.googleAds)}) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={googleHotelBidCeiling}
                        onChange={(e) => {
                          setGoogleHotelBidCeiling(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <p className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      Hotel campaigns require a linked Hotel Center account.
                      Google documents Manual CPC and Percent CPC for Hotel
                      campaigns; the backend must create the corresponding hotel
                      setting and bidding scheme.
                    </p>
                  </>
                )}

                {googleCampaignType === "APP" && (
                  <>
                    <div>
                      <label className={labelClass}>
                        App Campaign Subtype *
                      </label>
                      <select
                        value={googleAppSubtype}
                        onChange={(e) => {
                          const next = e.target.value as GoogleAppSubtype;
                          setGoogleAppSubtype(next);
                          const first = googleAppGoalOptionsBySubtype[next][0];
                          setGoogleAppGoalType(first.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        {googleAppSubtypeOptions.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>App Store *</label>
                      <select
                        value={googleAppStore}
                        onChange={(e) => {
                          setGoogleAppStore(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="GOOGLE_APP_STORE">Google Play</option>
                        <option value="APPLE_APP_STORE">Apple App Store</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>
                        App ID / Package Name *
                      </label>
                      <input
                        value={googleAppId}
                        onChange={(e) => {
                          setGoogleAppId(e.target.value);
                          clearPreview();
                        }}
                        placeholder="com.example.app or App Store ID"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        App Performance Goal *
                      </label>
                      <select
                        value={effectiveGoogleAppGoal}
                        onChange={(e) => {
                          setGoogleAppGoalType(
                            e.target.value as GoogleAppGoalType,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        {availableGoogleAppGoals.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedGoogleAppGoal.targetKind === "CPA" && (
                      <div>
                        <label className={labelClass}>
                          Target CPA / CPI (
                          {selectedCurrency(connections.googleAds)}) *
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={googleAppTargetCost}
                          onChange={(e) => {
                            setGoogleAppTargetCost(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                    )}
                    {selectedGoogleAppGoal.targetKind === "ROAS" && (
                      <div>
                        <label className={labelClass}>Target ROAS *</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.1"
                          value={googleAppTargetRoas}
                          onChange={(e) => {
                            setGoogleAppTargetRoas(e.target.value);
                            clearPreview();
                          }}
                          placeholder="e.g. 3.0 = 300%"
                          className={inputClass}
                        />
                      </div>
                    )}
                    <p className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Google App campaigns use advertising_channel_type
                      MULTI_CHANNEL plus a subtype. App engagement requires an
                      eligible Audience criterion containing an app-user
                      segment. The API maps each subtype to its own App Ad
                      resource; verify app-store/subtype availability before
                      creation.
                    </p>
                  </>
                )}
                <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Campaign schedule & targeting
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>
                        Start Date{" "}
                        {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                          ? "*"
                          : "(optional)"}
                      </label>
                      <input
                        type="date"
                        value={googleStartDate}
                        onChange={(e) => {
                          setGoogleStartDate(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        End Date{" "}
                        {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                          ? "*"
                          : "(optional)"}
                      </label>
                      <input
                        type="date"
                        value={googleEndDate}
                        onChange={(e) => {
                          setGoogleEndDate(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Location resource names (one per line)
                      </label>
                      <textarea
                        rows={2}
                        value={googleGeoTargetResources}
                        onChange={(e) => {
                          setGoogleGeoTargetResources(e.target.value);
                          clearPreview();
                        }}
                        placeholder="geoTargetConstants/2356"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Language resource names (one per line)
                      </label>
                      <textarea
                        rows={2}
                        value={googleLanguageResources}
                        onChange={(e) => {
                          setGoogleLanguageResources(e.target.value);
                          clearPreview();
                        }}
                        placeholder="languageConstants/1000"
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Custom Conversion Goal Resource Name (optional)
                      </label>
                      <input
                        value={googleCustomConversionGoalResourceName}
                        onChange={(e) => {
                          setGoogleCustomConversionGoalResourceName(
                            e.target.value,
                          );
                          clearPreview();
                        }}
                        placeholder="customers/123456/customConversionGoals/789"
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Leave blank to use account-level conversion goals. The
                        custom goal must already exist in the effective
                        conversion customer; the backend applies it through
                        ConversionGoalCampaignConfig after campaign creation.
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    The backend must resolve supported geo/language resource
                    names and create CampaignCriterion resources. These are not
                    free-text location names. Google conversion goals are
                    configured with ConversionGoalCampaignConfig /
                    CampaignConversionGoal resources—not a generic Campaign
                    objective field.
                  </p>
                </div>
                {googleCampaignType === "SEARCH" && (
                  <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-800">
                      Search Network Settings
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked
                          readOnly
                          className="mt-1"
                        />
                        <span>
                          <strong>Google Search</strong>
                          <span className="block text-xs text-slate-500">
                            Primary Search Network (required for this Search
                            setup)
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={googleSearchPartners}
                          onChange={(e) => {
                            setGoogleSearchPartners(e.target.checked);
                            clearPreview();
                          }}
                          className="mt-1"
                        />
                        <span>
                          <strong>Search Partners</strong>
                          <span className="block text-xs text-slate-500">
                            Maps to network_settings.target_search_network
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={googleDisplayExpansion}
                          onChange={(e) => {
                            setGoogleDisplayExpansion(e.target.checked);
                            clearPreview();
                          }}
                          className="mt-1"
                        />
                        <span>
                          <strong>Display Network expansion</strong>
                          <span className="block text-xs text-slate-500">
                            Maps to network_settings.target_content_network
                          </span>
                        </span>
                      </label>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Google Search is enabled separately. Search Partners are
                      controlled through target_search_network in the API.
                    </p>
                  </div>
                )}
                <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Google Campaign Budget API
                  </p>
                  {googleSupportsCampaignTotalBudget && (
                    <div className="mt-3">
                      <label className={labelClass}>Budget Period *</label>
                      <select
                        value={effectiveGoogleBudgetMode}
                        onChange={(e) => {
                          setGoogleBudgetMode(
                            e.target.value as GoogleBudgetMode,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="DAILY">Average daily budget</option>
                        <option value="CAMPAIGN_TOTAL">
                          Campaign total budget
                        </option>
                      </select>
                    </div>
                  )}
                  {effectiveGoogleBudgetMode === "DAILY" ? (
                    <div className="mt-3">
                      <label className={labelClass}>
                        Average Daily Budget (
                        {selectedCurrency(connections.googleAds)}) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={googleDailyBudget}
                        onChange={(e) => {
                          setGoogleDailyBudget(e.target.value);
                          clearPreview();
                        }}
                        placeholder="e.g. 500"
                        className={inputClass}
                      />
                      {googleCampaignType === "DEMAND_GEN" && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                          Google Ads API enforces a minimum Demand Gen daily
                          budget of USD 5 (or account-currency equivalent) for
                          new and modified campaigns from April 1, 2026. In API
                          v26, the backend can query
                          currency_constant.demand_gen_info.minimum_budget_per_day_micros
                          before submission.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3">
                      <label className={labelClass}>
                        Campaign Total Budget (
                        {selectedCurrency(connections.googleAds)}) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={googleCampaignTotalBudget}
                        onChange={(e) => {
                          setGoogleCampaignTotalBudget(e.target.value);
                          clearPreview();
                        }}
                        placeholder="Total amount for the full campaign period"
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-amber-700">
                        Campaign total budgets require start and end dates, use
                        period=CUSTOM_PERIOD and total_amount_micros, and cannot
                        be shared. Supported here for Search, Performance Max,
                        Demand Gen and Standard Shopping.
                      </p>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    Create a separate CampaignBudget resource with
                    CampaignBudgetService.MutateCampaignBudgets, then attach its
                    resource name to Campaign.campaign_budget. Convert
                    account-currency amounts to micros (× 1,000,000).
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedPlatforms.includes("metaAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-blue-700">
                  M
                </div>
                <div>
                  <h3 className="font-bold">Meta Ads</h3>
                  <p className="text-xs text-slate-500">
                    {selectedAccountLabel(connections.metaAds)} ·{" "}
                    {selectedCurrency(connections.metaAds)}
                  </p>
                </div>
              </div>
              {!objective ? (
                <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Choose a shared campaign objective in Campaign Basics first.
                </p>
              ) : (
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      Meta Campaign Objective
                    </label>
                    <input
                      readOnly
                      value={metaObjectiveMap[objective]}
                      className={`${inputClass} bg-slate-50 text-slate-600`}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Mapped from your shared business objective.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Buying Type *</label>
                    <select
                      value={metaBuyingType}
                      onChange={(e) => {
                        setMetaBuyingType(e.target.value as MetaBuyingType);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      {metaBuyingTypes.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Sent as Meta campaign-level <code>buying_type</code>.
                      Reservation buying requires the Reach &amp; Frequency
                      reservation workflow and may depend on account
                      eligibility.
                    </p>
                    {metaBuyingType === "RESERVED" && (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                        Reserved is shown as a supported Meta buying type, but
                        this builder does not yet collect reservation
                        predictions or assign a reservation to an Ad Set. Choose
                        Auction to prepare a request in this version.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Budget Level *</label>
                    <select
                      value={metaBudgetLevel}
                      onChange={(e) => {
                        setMetaBudgetLevel(e.target.value as MetaBudgetLevel);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="CAMPAIGN">Campaign-level budget</option>
                      <option value="AD_SET">Ad set-level budget</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Budget Type *</label>
                    <select
                      value={metaBudgetMode}
                      onChange={(e) => {
                        setMetaBudgetMode(
                          e.target.value as "DAILY" | "LIFETIME",
                        );
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="DAILY">Daily budget</option>
                      <option value="LIFETIME">Lifetime budget</option>
                    </select>
                  </div>
                  {metaBudgetMode === "DAILY" ? (
                    <div>
                      <label className={labelClass}>
                        {metaBudgetLevel === "CAMPAIGN"
                          ? "Daily Campaign Budget"
                          : "Daily Ad Set Budget"}{" "}
                        ({selectedCurrency(connections.metaAds)}) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={metaDailyBudget}
                        onChange={(e) => {
                          setMetaDailyBudget(e.target.value);
                          clearPreview();
                        }}
                        placeholder="e.g. 500"
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Only one budget level is used: Campaign (CBO) or Ad Set
                        (ABO). Converted to the account currency's minor units.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className={labelClass}>
                        {metaBudgetLevel === "CAMPAIGN"
                          ? "Lifetime Campaign Budget"
                          : "Lifetime Ad Set Budget"}{" "}
                        ({selectedCurrency(connections.metaAds)}) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={metaLifetimeBudget}
                        onChange={(e) => {
                          setMetaLifetimeBudget(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Start Time *</label>
                          <input
                            type="datetime-local"
                            value={metaStartTime}
                            onChange={(e) => {
                              setMetaStartTime(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>End Time *</label>
                          <input
                            type="datetime-local"
                            value={metaEndTime}
                            onChange={(e) => {
                              setMetaEndTime(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Meta requires an end_time with lifetime_budget. The
                        backend converts the amount to minor units.
                      </p>
                    </div>
                  )}
                  {metaBudgetMode === "DAILY" && (
                    <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-800">
                        Optional Ad Set schedule
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>
                            Start Time (optional)
                          </label>
                          <input
                            type="datetime-local"
                            value={metaStartTime}
                            onChange={(e) => {
                              setMetaStartTime(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            End Time (optional)
                          </label>
                          <input
                            type="datetime-local"
                            value={metaEndTime}
                            onChange={(e) => {
                              setMetaEndTime(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        For daily budgets, both values may be omitted. If
                        provided, the backend sends them on the Ad Set.
                      </p>
                    </div>
                  )}
                  <div>
                    <label className={labelClass}>
                      Performance Goal (Meta optimization_goal) *
                    </label>
                    <select
                      value={effectiveMetaOptimizationGoal}
                      onChange={(e) => {
                        setMetaOptimizationGoal(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      {availableMetaOptimizationOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      This is an Ad Set setting in Meta, not a Campaign field.
                      Options are filtered using the selected campaign
                      objective.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Billing Event *</label>
                    <select
                      value={effectiveMetaBillingEvent}
                      onChange={(e) => {
                        setMetaBillingEvent(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      {availableMetaBillingOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Choices are narrowed by the optimization goal; the backend
                      must still verify the selected pair against the account
                      and API version.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Bid Strategy *</label>
                    <select
                      value={metaBidStrategy}
                      onChange={(e) => {
                        setMetaBidStrategy(e.target.value as MetaBidStrategy);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      {metaBidStrategies.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Applied at Campaign level for campaign budgets or Ad Set
                      level for ad set budgets.
                    </p>
                  </div>
                  {["LOWEST_COST_WITH_BID_CAP", "COST_CAP"].includes(
                    metaBidStrategy,
                  ) && (
                    <div>
                      <label className={labelClass}>
                        Bid Amount ({selectedCurrency(connections.metaAds)}) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={metaBidAmount}
                        onChange={(e) => {
                          setMetaBidAmount(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        The backend converts this amount to the currency's minor
                        units before sending bid_amount.
                      </p>
                    </div>
                  )}
                  {metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && (
                    <div>
                      <label className={labelClass}>Minimum ROAS Floor *</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.1"
                        value={metaMinimumRoas}
                        onChange={(e) => {
                          setMetaMinimumRoas(e.target.value);
                          clearPreview();
                        }}
                        placeholder="e.g. 2.0"
                        className={inputClass}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Requires Meta's VALUE optimization goal. The backend
                        converts this ratio to
                        bid_constraints.roas_average_floor.
                      </p>
                    </div>
                  )}
                  <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-800">
                      Audience targeting (Ad Set)
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Enter ISO 3166-1 alpha-2 country codes. Interest targeting
                      requires Meta's target-search IDs and will be added in the
                      audience stage.
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Countries *</label>
                        <input
                          value={metaCountries}
                          onChange={(e) => {
                            setMetaCountries(e.target.value);
                            clearPreview();
                          }}
                          placeholder="IN, US"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Region Keys (optional; one per line)
                        </label>
                        <textarea
                          rows={2}
                          value={metaRegionKeys}
                          onChange={(e) => {
                            setMetaRegionKeys(e.target.value);
                            clearPreview();
                          }}
                          placeholder="Meta geo-location region key"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          City Keys (optional; one per line)
                        </label>
                        <textarea
                          rows={2}
                          value={metaCityKeys}
                          onChange={(e) => {
                            setMetaCityKeys(e.target.value);
                            clearPreview();
                          }}
                          placeholder="Meta geo-location city key"
                          className={inputClass}
                        />
                      </div>
                      {metaCityKeys.trim() && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={labelClass}>City radius</label>
                            <input
                              type="number"
                              min="1"
                              max="80"
                              value={metaCityRadius}
                              onChange={(e) => {
                                setMetaCityRadius(e.target.value);
                                clearPreview();
                              }}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Distance unit</label>
                            <select
                              value={metaCityDistanceUnit}
                              onChange={(e) => {
                                setMetaCityDistanceUnit(
                                  e.target.value as "kilometer" | "mile",
                                );
                                clearPreview();
                              }}
                              className={inputClass}
                            >
                              <option value="kilometer">Kilometers</option>
                              <option value="mile">Miles</option>
                            </select>
                          </div>
                        </div>
                      )}
                      <div>
                        <label className={labelClass}>
                          ZIP Keys (optional; e.g. US:94103)
                        </label>
                        <textarea
                          rows={2}
                          value={metaZipKeys}
                          onChange={(e) => {
                            setMetaZipKeys(e.target.value);
                            clearPreview();
                          }}
                          placeholder="US:94103"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Gender</label>
                        <select
                          value={metaGender}
                          onChange={(e) => {
                            setMetaGender(
                              e.target.value as "ALL" | "MEN" | "WOMEN",
                            );
                            clearPreview();
                          }}
                          className={inputClass}
                        >
                          <option value="ALL">All genders</option>
                          <option value="MEN">Men</option>
                          <option value="WOMEN">Women</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Minimum Age *</label>
                        <input
                          type="number"
                          min="18"
                          max="65"
                          value={metaAgeMin}
                          onChange={(e) => {
                            setMetaAgeMin(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Maximum Age *</label>
                        <input
                          type="number"
                          min="18"
                          max="65"
                          value={metaAgeMax}
                          onChange={(e) => {
                            setMetaAgeMax(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass}>
                          Interest IDs (one per line; use Meta Targeting Search
                          IDs)
                        </label>
                        <textarea
                          rows={2}
                          value={metaAudienceInterestIds}
                          onChange={(e) => {
                            setMetaAudienceInterestIds(e.target.value);
                            clearPreview();
                          }}
                          placeholder="6003139266461"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Include Custom Audience IDs
                        </label>
                        <textarea
                          rows={2}
                          value={metaIncludedCustomAudienceIds}
                          onChange={(e) => {
                            setMetaIncludedCustomAudienceIds(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Exclude Custom Audience IDs
                        </label>
                        <textarea
                          rows={2}
                          value={metaExcludedCustomAudienceIds}
                          onChange={(e) => {
                            setMetaExcludedCustomAudienceIds(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3">
                        <label className={labelClass}>Placements *</label>
                        <select
                          value={metaPlacementMode}
                          onChange={(e) => {
                            setMetaPlacementMode(
                              e.target.value as "AUTOMATIC" | "MANUAL",
                            );
                            clearPreview();
                          }}
                          className={inputClass}
                        >
                          <option value="AUTOMATIC">
                            Automatic placements (Advantage+ placements)
                          </option>
                          <option value="MANUAL">Manual placements</option>
                        </select>
                        {metaPlacementMode === "MANUAL" && (
                          <>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {[
                                ["facebook", "Facebook"],
                                ["instagram", "Instagram"],
                                ["messenger", "Messenger"],
                                ["audience_network", "Audience Network"],
                              ].map(([value, label]) => (
                                <label
                                  key={value}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={metaPublisherPlatforms.includes(
                                      value,
                                    )}
                                    onChange={(e) =>
                                      setMetaPublisherPlatforms((current) =>
                                        e.target.checked
                                          ? [...current, value]
                                          : current.filter((v) => v !== value),
                                      )
                                    }
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                            {metaPublisherPlatforms.includes("facebook") && (
                              <div className="mt-3">
                                <label className={labelClass}>
                                  Facebook positions (comma-separated)
                                </label>
                                <input
                                  value={metaFacebookPositions.join(", ")}
                                  onChange={(e) => {
                                    setMetaFacebookPositions(
                                      e.target.value
                                        .split(",")
                                        .map((v) => v.trim())
                                        .filter(Boolean),
                                    );
                                    clearPreview();
                                  }}
                                  className={inputClass}
                                  placeholder="feed, story, reels"
                                />
                              </div>
                            )}
                            {metaPublisherPlatforms.includes("instagram") && (
                              <div className="mt-3">
                                <label className={labelClass}>
                                  Instagram positions (comma-separated)
                                </label>
                                <input
                                  value={metaInstagramPositions.join(", ")}
                                  onChange={(e) => {
                                    setMetaInstagramPositions(
                                      e.target.value
                                        .split(",")
                                        .map((v) => v.trim())
                                        .filter(Boolean),
                                    );
                                    clearPreview();
                                  }}
                                  className={inputClass}
                                  placeholder="stream, story, reels, explore"
                                />
                              </div>
                            )}
                            {metaPublisherPlatforms.includes("messenger") && (
                              <div className="mt-3">
                                <label className={labelClass}>
                                  Messenger positions (comma-separated)
                                </label>
                                <input
                                  value={metaMessengerPositions.join(", ")}
                                  onChange={(e) => {
                                    setMetaMessengerPositions(
                                      e.target.value
                                        .split(",")
                                        .map((v) => v.trim())
                                        .filter(Boolean),
                                    );
                                    clearPreview();
                                  }}
                                  className={inputClass}
                                  placeholder="messenger_home, sponsored_messages"
                                />
                              </div>
                            )}
                            {metaPublisherPlatforms.includes(
                              "audience_network",
                            ) && (
                              <div className="mt-3">
                                <label className={labelClass}>
                                  Audience Network positions (comma-separated)
                                </label>
                                <input
                                  value={metaAudienceNetworkPositions.join(
                                    ", ",
                                  )}
                                  onChange={(e) => {
                                    setMetaAudienceNetworkPositions(
                                      e.target.value
                                        .split(",")
                                        .map((v) => v.trim())
                                        .filter(Boolean),
                                    );
                                    clearPreview();
                                  }}
                                  className={inputClass}
                                  placeholder="classic, rewarded_video"
                                />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {metaSpecialAdCategories.length > 0 && (
                      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                        Special Ad Category selected: restricted categories can
                        limit age, gender, location and detailed-targeting
                        controls. This builder omits age/gender targeting for
                        this campaign; the API and policy validation must
                        enforce the applicable market rules.
                      </p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>
                      Special Ad Categories (select every applicable category)
                    </label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {[
                        ["CREDIT", "Credit"],
                        [
                          "FINANCIAL_PRODUCTS_SERVICES",
                          "Financial Products & Services",
                        ],
                        ["EMPLOYMENT", "Employment"],
                        ["HOUSING", "Housing"],
                        [
                          "ISSUES_ELECTIONS_POLITICS",
                          "Social issues, elections or politics",
                        ],
                        [
                          "ONLINE_GAMBLING_AND_GAMING",
                          "Online gambling and gaming",
                        ],
                      ].map(([value, label]) => (
                        <label
                          key={value}
                          className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={metaSpecialAdCategories.includes(value)}
                            onChange={(e) => {
                              setMetaSpecialAdCategories((current) =>
                                e.target.checked
                                  ? [...current, value]
                                  : current.filter((item) => item !== value),
                              );
                              clearPreview();
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Leave all unchecked only when none apply. The API field is
                      an array, so the builder supports multiple applicable
                      categories.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              Provider validation
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              Google's channel type, sub-type, network settings and bidding
              fields differ by campaign type. Meta's buying_type and
              special_ad_categories belong to the Campaign; optimization_goal,
              billing_event, targeting and creatives belong to the Ad Set / Ad
              layers. The backend must validate every provider combination and
              account eligibility before creating anything.
            </p>
          </div>
        </section>
      )}

      {workspaceView === "builder" && step === 3 && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold">
              Ad Group, Asset Group & Ad Set setup
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Configure the next resource layer for each selected provider.
              These are separate provider-specific structures.
            </p>
          </div>

          {selectedPlatforms.includes("googleAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold text-slate-900">Google Ads</h3>
              {googleCampaignType === "PERFORMANCE_MAX" ? (
                <div className="mt-5">
                  <div className="max-w-xl">
                    <label className={labelClass}>Asset Group Name *</label>
                    <input
                      value={pmaxAssetGroupName}
                      onChange={(e) => {
                        setPmaxAssetGroupName(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    />
                  </div>
                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                    Performance Max uses an Asset Group rather than a standard
                    Ad Group. We will configure its headlines, descriptions,
                    images and logo in the next step.
                  </p>
                </div>
              ) : googleCampaignType === "HOTEL" ? (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>
                        Hotel Ad Group Name *
                      </label>
                      <input
                        value={googleHotelAdGroupName}
                        onChange={(e) => {
                          setGoogleHotelAdGroupName(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Target Country Code *
                      </label>
                      <input
                        value={googleHotelTargetCountry}
                        onChange={(e) => {
                          setGoogleHotelTargetCountry(
                            e.target.value.toUpperCase(),
                          );
                          clearPreview();
                        }}
                        placeholder="US"
                        maxLength={2}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Language Code *</label>
                      <input
                        value={googleHotelLanguage}
                        onChange={(e) => {
                          setGoogleHotelLanguage(e.target.value.toLowerCase());
                          clearPreview();
                        }}
                        placeholder="en"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Hotel Listing Selection *
                      </label>
                      <select
                        value={googleHotelListingMode}
                        onChange={(e) => {
                          setGoogleHotelListingMode(
                            e.target.value as "ALL_HOTELS" | "SELECTED_HOTELS",
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="ALL_HOTELS">
                          All hotels in linked feed
                        </option>
                        <option value="SELECTED_HOTELS">
                          Selected hotel properties
                        </option>
                      </select>
                    </div>
                    {googleHotelListingMode === "SELECTED_HOTELS" && (
                      <div className="sm:col-span-2">
                        <label className={labelClass}>
                          Hotel Center Property IDs *
                        </label>
                        <textarea
                          rows={3}
                          value={googleHotelPropertyIds}
                          onChange={(e) => {
                            setGoogleHotelPropertyIds(e.target.value);
                            clearPreview();
                          }}
                          placeholder="Enter one Hotel Center property ID per line"
                          className={inputClass}
                        />
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    Hotel campaigns use hotel listings and pricing from Hotel
                    Center; they do not use ordinary text/image ad creatives.
                    This prototype collects the account, targeting and listing
                    choices. Actual listing-group tree operations and Hotel
                    Center feed management require backend/API work and an
                    allowlisted linked account.
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Ad Group Name *</label>
                    <input
                      value={googleAdGroupName}
                      onChange={(e) => {
                        setGoogleAdGroupName(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    />
                  </div>
                  {["SEARCH", "DISPLAY", "SHOPPING"].includes(
                    googleCampaignType,
                  ) && (
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Audience User List Resource Names (optional; one per
                        line)
                      </label>
                      <textarea
                        rows={2}
                        value={googleAdGroupUserLists}
                        onChange={(e) => {
                          setGoogleAdGroupUserLists(e.target.value);
                          clearPreview();
                        }}
                        placeholder="customers/123/userLists/456"
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Applies eligible Google Ads remarketing lists at Ad
                        Group level. The backend must confirm list eligibility
                        and campaign-type compatibility.
                      </p>
                    </div>
                  )}
                  {googleCampaignType === "DEMAND_GEN" && (
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Demand Gen Audience Resource Names (optional; one per
                        line)
                      </label>
                      <textarea
                        rows={2}
                        value={googleDemandGenAudienceResources}
                        onChange={(e) => {
                          setGoogleDemandGenAudienceResources(e.target.value);
                          clearPreview();
                        }}
                        placeholder="customers/123/audiences/456"
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Demand Gen uses AudienceInfo criteria, not direct
                        UserListInfo criteria. Create or select a reusable
                        Google Audience first.
                      </p>
                    </div>
                  )}
                  {googleCampaignType === "SEARCH" && (
                    <>
                      <div>
                        <label className={labelClass}>Keyword Match Type</label>
                        <select
                          value={googleKeywordMatchType}
                          onChange={(e) => {
                            setGoogleKeywordMatchType(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        >
                          <option value="BROAD">Broad match</option>
                          <option value="PHRASE">Phrase match</option>
                          <option value="EXACT">Exact match</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass}>
                          Keywords * (one keyword per line)
                        </label>
                        <textarea
                          rows={5}
                          value={googleKeywordLines}
                          onChange={(e) => {
                            setGoogleKeywordLines(e.target.value);
                            clearPreview();
                          }}
                          placeholder={
                            "project management software\nteam collaboration tool\nworkflow automation"
                          }
                          className={inputClass}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass}>
                          Negative Keywords (optional; one per line)
                        </label>
                        <textarea
                          rows={3}
                          value={googleNegativeKeywordLines}
                          onChange={(e) => {
                            setGoogleNegativeKeywordLines(e.target.value);
                            clearPreview();
                          }}
                          placeholder={"free\njobs\nused"}
                          className={inputClass}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          These become separate negative AdGroupCriterion
                          resources; they do not share the positive keyword
                          resource.
                        </p>
                      </div>
                      {effectiveGoogleBiddingMode === "MANUAL_CPC" && (
                        <div>
                          <label className={labelClass}>
                            Default CPC Bid (
                            {selectedCurrency(connections.googleAds)}) *
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={googleDefaultCpcBid}
                            onChange={(e) => {
                              setGoogleDefaultCpcBid(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            The backend converts this amount to micros for the
                            Ad Group bid field.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  {googleCampaignType === "DISPLAY" &&
                    ["MANUAL_CPC", "MANUAL_CPM"].includes(
                      effectiveGoogleBiddingMode,
                    ) && (
                      <div>
                        <label className={labelClass}>
                          Default{" "}
                          {effectiveGoogleBiddingMode === "MANUAL_CPC"
                            ? "CPC"
                            : "CPM"}{" "}
                          Bid ({selectedCurrency(connections.googleAds)}) *
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={googleDefaultCpcBid}
                          onChange={(e) => {
                            setGoogleDefaultCpcBid(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          The backend converts this amount to micros and maps it
                          to the matching Ad Group bid field.
                        </p>
                      </div>
                    )}
                  <p className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                    The Ad Group belongs to the selected Google campaign.
                    Responsive Search Ad copy is configured in the next step.
                    Demand Gen channel selections remain in Platform Settings
                    because they are Ad Group settings.
                  </p>
                </div>
              )}
            </div>
          )}

          {selectedPlatforms.includes("metaAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold text-slate-900">
                Meta Ads — Ad Set configuration
              </h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Ad Set Name *</label>
                  <input
                    value={metaAdSetName}
                    onChange={(e) => {
                      setMetaAdSetName(e.target.value);
                      clearPreview();
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Meta Pixel ID (optional, website conversion)
                  </label>
                  <input
                    value={metaPixelId}
                    onChange={(e) => {
                      setMetaPixelId(e.target.value);
                      clearPreview();
                    }}
                    placeholder="Pixel ID"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Conversion Event (when using Pixel)
                  </label>
                  <select
                    value={metaConversionEvent}
                    onChange={(e) => {
                      setMetaConversionEvent(e.target.value);
                      clearPreview();
                    }}
                    className={inputClass}
                  >
                    <option value="PURCHASE">Purchase</option>
                    <option value="LEAD">Lead</option>
                    <option value="COMPLETE_REGISTRATION">
                      Complete Registration
                    </option>
                    <option value="ADD_TO_CART">Add to Cart</option>
                    <option value="VIEW_CONTENT">View Content</option>
                  </select>
                </div>
              </div>
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Audience, budget, optimization and billing settings are
                configured in Platform Settings. Page identity, ad copy, media
                and call-to-action are configured in the next Ad Creation step.
              </p>
            </div>
          )}
        </section>
      )}

      {workspaceView === "builder" && step === 4 && (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div>
              <p className="font-bold text-violet-950">
                Create campaign visuals with AI Creative Studio
              </p>
              <p className="mt-1 text-xs text-violet-800">
                Explore image and video concepts, approve one, and attach it to
                this campaign draft.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setWorkspaceView("creative");
                setCreativeStudioNotice("");
              }}
              className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"
            >
              Open Creative Studio
            </button>
          </div>
          <section className="mt-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold">Ad Creation & Assets</h2>
              <p className="mt-1 text-sm text-slate-500">
                Create the ad content that belongs to the groups and ad sets
                configured in the previous step. Each provider keeps its native
                format.
              </p>
            </div>

            {selectedPlatforms.includes("googleAds") && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Google Ads creative
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Format depends on the selected campaign type: Search ad,
                      responsive display / Demand Gen draft, or Performance Max
                      asset group.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceView("assets");
                      setAssetNotice("");
                    }}
                    className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Open Asset Library
                  </button>
                </div>

                {googleCampaignType === "SEARCH" && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className={labelClass}>Final URL *</label>
                      <input
                        type="url"
                        value={googleSearchFinalUrl}
                        onChange={(e) => {
                          setGoogleSearchFinalUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          websiteUrl || "https://www.example.com/landing-page"
                        }
                        className={inputClass}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>
                          Display path 1 (optional)
                        </label>
                        <input
                          value={googleSearchPath1}
                          onChange={(e) => {
                            setGoogleSearchPath1(e.target.value);
                            clearPreview();
                          }}
                          maxLength={15}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Display path 2 (optional)
                        </label>
                        <input
                          value={googleSearchPath2}
                          onChange={(e) => {
                            setGoogleSearchPath2(e.target.value);
                            clearPreview();
                          }}
                          maxLength={15}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Responsive Search Ad headlines * (3–15; one per line;
                        maximum 30 characters each)
                      </label>
                      <textarea
                        rows={5}
                        value={googleSearchHeadlines}
                        onChange={(e) => {
                          setGoogleSearchHeadlines(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          "Build better workflows\nManage projects in one place\nStart your free trial"
                        }
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        {
                          googleSearchHeadlines
                            .split("\n")
                            .filter((item) => item.trim()).length
                        }{" "}
                        headline(s)
                      </p>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Descriptions * (2–4; one per line; maximum 90 characters
                        each)
                      </label>
                      <textarea
                        rows={4}
                        value={googleSearchDescriptions}
                        onChange={(e) => {
                          setGoogleSearchDescriptions(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          "Plan work, collaborate and deliver projects faster.\nTry the workspace built for growing teams."
                        }
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        {
                          googleSearchDescriptions
                            .split("\n")
                            .filter((item) => item.trim()).length
                        }{" "}
                        description(s)
                      </p>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      This creates a Responsive Search Ad draft under the Search
                      Ad Group. In the real integration, the backend maps the
                      headlines, descriptions and final URL into Google's
                      `AdGroupAd` / `ResponsiveSearchAd` resources.
                    </div>
                  </div>
                )}

                {googleCampaignType === "PERFORMANCE_MAX" && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className={labelClass}>Final URL *</label>
                      <input
                        type="url"
                        value={pmaxFinalUrl}
                        onChange={(e) => {
                          setPmaxFinalUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          websiteUrl || "https://www.example.com/landing-page"
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Headlines * (minimum 3; one per line; maximum 30
                        characters each)
                      </label>
                      <textarea
                        rows={4}
                        value={pmaxHeadlines}
                        onChange={(e) => {
                          setPmaxHeadlines(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          "Your first headline\nYour second headline\nYour third headline"
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Long Headlines * (1–5; one per line; maximum 90
                        characters each)
                      </label>
                      <textarea
                        rows={2}
                        value={pmaxLongHeadline}
                        onChange={(e) => {
                          setPmaxLongHeadline(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Descriptions * (2–5; at least one must be 60 characters
                        or fewer; maximum 90 characters each)
                      </label>
                      <textarea
                        rows={4}
                        value={pmaxDescriptions}
                        onChange={(e) => {
                          setPmaxDescriptions(e.target.value);
                          clearPreview();
                        }}
                        placeholder={"First description\nSecond description"}
                        className={inputClass}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>
                          Business Name * (maximum 25 characters)
                        </label>
                        <input
                          value={pmaxBusinessName}
                          onChange={(e) => {
                            setPmaxBusinessName(e.target.value);
                            clearPreview();
                          }}
                          placeholder={businessName || "Business name"}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Logo URL *</label>
                        <input
                          type="url"
                          value={pmaxLogoUrl}
                          onChange={(e) => {
                            setPmaxLogoUrl(e.target.value);
                            clearPreview();
                          }}
                          placeholder="https://.../logo.png"
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setWorkspaceView("assets");
                            setAssetNotice(
                              "Choose a logo or image from the Asset Library.",
                            );
                          }}
                          className="mt-2 text-xs font-semibold text-blue-700"
                        >
                          Choose from Asset Library
                        </button>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Landscape Image URL *
                        </label>
                        <input
                          type="url"
                          value={pmaxLandscapeImageUrl}
                          onChange={(e) => {
                            setPmaxLandscapeImageUrl(e.target.value);
                            clearPreview();
                          }}
                          placeholder="https://.../landscape.jpg"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Square Image URL *</label>
                        <input
                          type="url"
                          value={pmaxSquareImageUrl}
                          onChange={(e) => {
                            setPmaxSquareImageUrl(e.target.value);
                            clearPreview();
                          }}
                          placeholder="https://.../square.jpg"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Portrait Image URL (optional)
                        </label>
                        <input
                          type="url"
                          value={pmaxPortraitImageUrl}
                          onChange={(e) => {
                            setPmaxPortraitImageUrl(e.target.value);
                            clearPreview();
                          }}
                          placeholder="https://.../portrait.jpg"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          YouTube Video IDs (optional; one per line)
                        </label>
                        <textarea
                          rows={2}
                          value={pmaxYoutubeVideoIds}
                          onChange={(e) => {
                            setPmaxYoutubeVideoIds(e.target.value);
                            clearPreview();
                          }}
                          placeholder="YouTube video ID"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>
                          Search Themes (optional; one per line)
                        </label>
                        <textarea
                          rows={3}
                          value={pmaxSearchThemes}
                          onChange={(e) => {
                            setPmaxSearchThemes(e.target.value);
                            clearPreview();
                          }}
                          placeholder={
                            "running shoes\ncomfortable walking shoes"
                          }
                          className={inputClass}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          Maps to AssetGroupSignal.search_theme. These are
                          signals, not keyword targeting.
                        </p>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Audience Resource Names (optional)
                        </label>
                        <textarea
                          rows={3}
                          value={pmaxAudienceResourceNames}
                          onChange={(e) => {
                            setPmaxAudienceResourceNames(e.target.value);
                            clearPreview();
                          }}
                          placeholder="customers/123/audiences/456"
                          className={inputClass}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          Maps to AssetGroupSignal.audience. Use a customers /
                          audiences resource name; create the reusable Audience
                          resource first.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      A non-retail Performance Max Asset Group uses linked
                      assets. In production, upload assets first and link the
                      required asset types to the Asset Group in the appropriate
                      mutate workflow. Search themes and audience signals are
                      optional signals, not hard targeting restrictions.
                    </div>
                  </div>
                )}

                {googleCampaignType === "DISPLAY" && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className={labelClass}>Final URL *</label>
                      <input
                        type="url"
                        value={googleDisplayFinalUrl}
                        onChange={(e) => {
                          setGoogleDisplayFinalUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          websiteUrl || "https://www.example.com/landing-page"
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Headlines * (1–5; max 30 characters each)
                      </label>
                      <textarea
                        rows={3}
                        value={googleDisplayHeadlines}
                        onChange={(e) => {
                          setGoogleDisplayHeadlines(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Long Headline * (max 90 characters)
                      </label>
                      <input
                        value={googleDisplayLongHeadline}
                        onChange={(e) => {
                          setGoogleDisplayLongHeadline(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Descriptions * (1–5; max 90 characters each)
                      </label>
                      <textarea
                        rows={3}
                        value={googleDisplayDescriptions}
                        onChange={(e) => {
                          setGoogleDisplayDescriptions(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Business Name * (max 25 characters)
                      </label>
                      <input
                        value={googleDisplayBusinessName}
                        onChange={(e) => {
                          setGoogleDisplayBusinessName(e.target.value);
                          clearPreview();
                        }}
                        placeholder={businessName}
                        className={inputClass}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>
                          Landscape Image URL * (1.91:1; min 600×314)
                        </label>
                        <input
                          type="url"
                          value={googleDisplayImageUrl}
                          onChange={(e) => {
                            setGoogleDisplayImageUrl(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Square Image URL * (1:1; min 300×300)
                        </label>
                        <input
                          type="url"
                          value={googleDisplaySquareImageUrl}
                          onChange={(e) => {
                            setGoogleDisplaySquareImageUrl(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Responsive Display Ad requirements: landscape + square
                      image, short headlines, long headline, descriptions and
                      business name. Image dimensions/ratios must be verified
                      from uploaded media metadata by the production backend.
                    </p>
                  </div>
                )}

                {googleCampaignType === "DEMAND_GEN" && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className={labelClass}>
                        Demand Gen Ad Format *
                      </label>
                      <select
                        value={googleDemandGenFormat}
                        onChange={(e) => {
                          setGoogleDemandGenFormat(
                            e.target.value as typeof googleDemandGenFormat,
                          );
                          clearPreview();
                        }}
                        className={inputClass}
                      >
                        <option value="MULTI_ASSET">
                          Multi-asset image ad
                        </option>
                        <option value="VIDEO_RESPONSIVE">
                          Responsive video ad
                        </option>
                        <option value="CAROUSEL">Carousel ad</option>
                        <option value="PRODUCT_FEED">Product feed ad</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Final URL *</label>
                      <input
                        type="url"
                        value={googleDisplayFinalUrl}
                        onChange={(e) => {
                          setGoogleDisplayFinalUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          websiteUrl || "https://www.example.com/landing-page"
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Business Name *</label>
                      <input
                        value={googleDisplayBusinessName}
                        onChange={(e) => {
                          setGoogleDisplayBusinessName(e.target.value);
                          clearPreview();
                        }}
                        placeholder={businessName}
                        className={inputClass}
                      />
                    </div>
                    {googleDemandGenFormat === "MULTI_ASSET" && (
                      <>
                        <div>
                          <label className={labelClass}>Headlines *</label>
                          <textarea
                            rows={3}
                            value={googleDisplayHeadlines}
                            onChange={(e) => {
                              setGoogleDisplayHeadlines(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Descriptions *</label>
                          <textarea
                            rows={3}
                            value={googleDisplayDescriptions}
                            onChange={(e) => {
                              setGoogleDisplayDescriptions(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Image URL *</label>
                          <input
                            type="url"
                            value={googleDisplayImageUrl}
                            onChange={(e) => {
                              setGoogleDisplayImageUrl(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                      </>
                    )}
                    {googleDemandGenFormat === "VIDEO_RESPONSIVE" && (
                      <>
                        <div>
                          <label className={labelClass}>
                            YouTube Video IDs * (one per line)
                          </label>
                          <textarea
                            rows={2}
                            value={googleDemandGenVideoIds}
                            onChange={(e) => {
                              setGoogleDemandGenVideoIds(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Logo Image URL * (v24+)
                          </label>
                          <input
                            type="url"
                            value={googleDemandGenLogoUrl}
                            onChange={(e) => {
                              setGoogleDemandGenLogoUrl(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                      </>
                    )}
                    {googleDemandGenFormat === "PRODUCT_FEED" && (
                      <>
                        <div>
                          <label className={labelClass}>
                            Merchant Center Account ID *
                          </label>
                          <input
                            inputMode="numeric"
                            value={googleMerchantCenterId}
                            onChange={(e) => {
                              setGoogleMerchantCenterId(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                            placeholder="Linked Merchant Center ID"
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Feed Label (optional)
                          </label>
                          <input
                            value={googleShoppingFeedLabel}
                            onChange={(e) => {
                              setGoogleShoppingFeedLabel(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Product Ad Headline *
                          </label>
                          <input
                            value={googleDemandGenProductHeadline}
                            onChange={(e) => {
                              setGoogleDemandGenProductHeadline(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Product Ad Description *
                          </label>
                          <input
                            value={googleDemandGenProductDescription}
                            onChange={(e) => {
                              setGoogleDemandGenProductDescription(
                                e.target.value,
                              );
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Square Logo URL * (min 128×128)
                          </label>
                          <input
                            type="url"
                            value={googleDemandGenProductLogoUrl}
                            onChange={(e) => {
                              setGoogleDemandGenProductLogoUrl(e.target.value);
                              clearPreview();
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Product Listing Selection
                          </label>
                          <select
                            value={googleDemandGenProductGroupMode}
                            onChange={(e) => {
                              setGoogleDemandGenProductGroupMode(
                                e.target.value as
                                  | "ALL_PRODUCTS"
                                  | "SELECTED_PRODUCTS",
                              );
                              clearPreview();
                            }}
                            className={inputClass}
                          >
                            <option value="ALL_PRODUCTS">All products</option>
                            <option value="SELECTED_PRODUCTS">
                              Selected product groups (backend listing tree
                              required)
                            </option>
                          </select>
                        </div>
                        <p className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          Requires Merchant Center linked to Google Ads. Product
                          feed and listing-group criteria are managed separately
                          from the creative.
                        </p>
                      </>
                    )}
                    {googleDemandGenFormat === "CAROUSEL" && (
                      <div>
                        <label className={labelClass}>
                          Carousel Cards * (2–10; one per line: headline | image
                          URL | final URL)
                        </label>
                        <textarea
                          rows={5}
                          value={googleDemandGenCarouselCards}
                          onChange={(e) => {
                            setGoogleDemandGenCarouselCards(e.target.value);
                            clearPreview();
                          }}
                          placeholder={
                            "Explore products | https://cdn.example.com/card1.jpg | https://example.com/product1"
                          }
                          className={inputClass}
                        />
                      </div>
                    )}
                    <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Demand Gen uses dedicated API ad resources:
                      DemandGenMultiAssetAdInfo, DemandGenVideoResponsiveAdInfo
                      or DemandGenCarouselAdInfo. These are not Responsive
                      Display Ads. Video ad assets and logos must be
                      uploaded/linked as Google Asset resources.
                    </p>
                  </div>
                )}

                {googleCampaignType === "APP" && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className={labelClass}>
                        App Ad Headlines * (one per line)
                      </label>
                      <textarea
                        rows={3}
                        value={googleAppHeadlines}
                        onChange={(e) => {
                          setGoogleAppHeadlines(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        App Ad Descriptions * (one per line)
                      </label>
                      <textarea
                        rows={3}
                        value={googleAppDescriptions}
                        onChange={(e) => {
                          setGoogleAppDescriptions(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Image Asset URLs (one per line)
                      </label>
                      <textarea
                        rows={3}
                        value={googleAppImageUrls}
                        onChange={(e) => {
                          setGoogleAppImageUrls(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        YouTube Video IDs (optional; one per line)
                      </label>
                      <textarea
                        rows={2}
                        value={googleAppYoutubeVideoIds}
                        onChange={(e) => {
                          setGoogleAppYoutubeVideoIds(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                    {googleAppSubtype === "APP_CAMPAIGN_FOR_ENGAGEMENT" && (
                      <>
                        <div>
                          <label className={labelClass}>
                            Eligible App-User Audience Resource *
                          </label>
                          <input
                            value={googleAppEngagementAudienceResource}
                            onChange={(e) => {
                              setGoogleAppEngagementAudienceResource(
                                e.target.value,
                              );
                              clearPreview();
                            }}
                            placeholder="customers/123456/audiences/789"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>
                            Selective Conversion Action Resources * (one per
                            line)
                          </label>
                          <textarea
                            rows={2}
                            value={googleAppSelectiveConversionActions}
                            onChange={(e) => {
                              setGoogleAppSelectiveConversionActions(
                                e.target.value,
                              );
                              clearPreview();
                            }}
                            placeholder="customers/123456/conversionActions/789"
                            className={inputClass}
                          />
                        </div>
                      </>
                    )}
                    <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                      Google maps the selected subtype to AppAdInfo,
                      AppEngagementAdInfo or AppPreRegistrationAdInfo.
                      Engagement requires an eligible UserList criterion and
                      selective-optimization conversion actions. Media must
                      exist as Google Asset resources before linking. The legacy
                      UI-only App Campaign installs workflow is distinct from
                      API-supported current App campaign subtypes.
                    </p>
                  </div>
                )}

                {["SHOPPING", "HOTEL", "APP"].includes(googleCampaignType) && (
                  <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                    {googleCampaignType === "SHOPPING" &&
                      "Shopping ads are primarily built from the linked Merchant Center product feed. Product titles, images, prices and landing pages are managed in Merchant Center rather than through a standard manual ad creative form."}
                    {googleCampaignType === "HOTEL" &&
                      "Hotel campaigns use Hotel Center property, availability and price data. They do not use a standard manually authored text/image ad creative in this wizard."}
                    {googleCampaignType === "APP" &&
                      "App campaign creatives use subtype-specific AppAdInfo, AppEngagementAdInfo or AppPreRegistrationAdInfo. Add the text and existing media assets below."}
                  </div>
                )}
              </div>
            )}

            {selectedPlatforms.includes("metaAds") && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Meta Ads — Ad Creative
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      The creative is created separately and then referenced by
                      the Meta Ad resource.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceView("assets");
                      setAssetNotice("");
                    }}
                    className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Open Asset Library
                  </button>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Creative Format *</label>
                    <select
                      value={metaCreativeFormat}
                      onChange={(e) => {
                        setMetaCreativeFormat(
                          e.target.value as typeof metaCreativeFormat,
                        );
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="SINGLE_IMAGE">Single image</option>
                      <option value="SINGLE_VIDEO">Single video</option>
                      <option value="CAROUSEL">Carousel (2–10 cards)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Destination Type *</label>
                    <select
                      value={metaDestinationType}
                      onChange={(e) => {
                        setMetaDestinationType(
                          e.target.value as typeof metaDestinationType,
                        );
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="WEBSITE">Website</option>
                      <option value="INSTANT_FORM">
                        Instant Form (existing form)
                      </option>
                      <option value="MESSAGING">
                        Messaging (connected destination)
                      </option>
                      <option value="APP">Mobile App</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Facebook Page ID *</label>
                    <input
                      value={metaPageId}
                      onChange={(e) => {
                        setMetaPageId(e.target.value);
                        clearPreview();
                      }}
                      placeholder="Numeric Page ID"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Instagram Actor ID (optional)
                    </label>
                    <input
                      value={metaInstagramActorId}
                      onChange={(e) => {
                        setMetaInstagramActorId(e.target.value);
                        clearPreview();
                      }}
                      placeholder="Instagram professional account ID"
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Primary Text *</label>
                    <textarea
                      rows={4}
                      value={metaPrimaryText}
                      onChange={(e) => {
                        setMetaPrimaryText(e.target.value);
                        clearPreview();
                      }}
                      placeholder="Write the main message users will see in the ad..."
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Ad Headline *</label>
                    <input
                      value={metaAdHeadline}
                      onChange={(e) => {
                        setMetaAdHeadline(e.target.value);
                        clearPreview();
                      }}
                      placeholder="A short compelling headline"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Ad Description (optional)
                    </label>
                    <input
                      value={metaAdDescription}
                      onChange={(e) => {
                        setMetaAdDescription(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Call to Action</label>
                    <select
                      value={metaCallToAction}
                      onChange={(e) => {
                        setMetaCallToAction(e.target.value);
                        clearPreview();
                      }}
                      className={inputClass}
                    >
                      <option value="LEARN_MORE">Learn More</option>
                      <option value="SHOP_NOW">Shop Now</option>
                      <option value="SIGN_UP">Sign Up</option>
                      <option value="CONTACT_US">Contact Us</option>
                      <option value="GET_QUOTE">Get Quote</option>
                      <option value="DOWNLOAD">Download</option>
                    </select>
                  </div>
                  {metaCreativeFormat === "SINGLE_IMAGE" && (
                    <div>
                      <label className={labelClass}>Creative Image URL *</label>
                      <input
                        type="url"
                        value={metaCreativeImageUrl}
                        onChange={(e) => {
                          setMetaCreativeImageUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder="https://.../ad-image.jpg"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setWorkspaceView("assets");
                          setAssetNotice(
                            "Choose an image for the Meta creative.",
                          );
                        }}
                        className="mt-2 text-xs font-semibold text-blue-700"
                      >
                        Choose from Asset Library
                      </button>
                    </div>
                  )}
                  {metaCreativeFormat === "SINGLE_VIDEO" && (
                    <div>
                      <label className={labelClass}>
                        Uploaded Meta Video ID *
                      </label>
                      <input
                        value={metaCreativeVideoId}
                        onChange={(e) => {
                          setMetaCreativeVideoId(e.target.value);
                          clearPreview();
                        }}
                        placeholder="Video ID returned by Meta video upload"
                        className={inputClass}
                      />
                    </div>
                  )}
                  {metaCreativeFormat === "CAROUSEL" && (
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Carousel Cards * (2–10; one per line: headline | image
                        URL | destination URL)
                      </label>
                      <textarea
                        rows={5}
                        value={metaCarouselCards}
                        onChange={(e) => {
                          setMetaCarouselCards(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                        placeholder={
                          "Card 1 | https://cdn.example.com/1.jpg | https://example.com/1\nCard 2 | https://cdn.example.com/2.jpg | https://example.com/2"
                        }
                      />
                    </div>
                  )}
                  {metaDestinationType === "WEBSITE" && (
                    <div>
                      <label className={labelClass}>
                        Website Destination URL *
                      </label>
                      <input
                        type="url"
                        value={metaDestinationUrl}
                        onChange={(e) => {
                          setMetaDestinationUrl(e.target.value);
                          clearPreview();
                        }}
                        placeholder={
                          websiteUrl || "https://example.com/landing-page"
                        }
                        className={inputClass}
                      />
                    </div>
                  )}
                  {metaDestinationType === "INSTANT_FORM" && (
                    <div>
                      <label className={labelClass}>
                        Existing Instant Form ID *
                      </label>
                      <input
                        value={metaInstantFormId}
                        onChange={(e) => {
                          setMetaInstantFormId(e.target.value);
                          clearPreview();
                        }}
                        className={inputClass}
                      />
                    </div>
                  )}
                  {metaDestinationType === "MESSAGING" && (
                    <>
                      <div>
                        <label className={labelClass}>
                          Messaging Destination *
                        </label>
                        <select
                          value={metaMessagingType}
                          onChange={(e) => {
                            setMetaMessagingType(
                              e.target.value as typeof metaMessagingType,
                            );
                            clearPreview();
                          }}
                          className={inputClass}
                        >
                          <option value="MESSENGER">Messenger</option>
                          <option value="INSTAGRAM_DIRECT">
                            Instagram Direct
                          </option>
                          <option value="WHATSAPP">WhatsApp</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Connected Messaging Asset ID *
                        </label>
                        <input
                          value={metaMessagingDestinationId}
                          onChange={(e) => {
                            setMetaMessagingDestinationId(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}
                  {metaDestinationType === "APP" && (
                    <>
                      <div>
                        <label className={labelClass}>Promoted App ID *</label>
                        <input
                          value={metaAppId}
                          onChange={(e) => {
                            setMetaAppId(e.target.value);
                            clearPreview();
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          App Store / Play Store URL *
                        </label>
                        <input
                          type="url"
                          value={metaAppStoreUrl}
                          onChange={(e) => {
                            setMetaAppStoreUrl(e.target.value);
                            clearPreview();
                          }}
                          placeholder="https://apps.apple.com/... or https://play.google.com/..."
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}
                </div>
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  This prototype covers website, existing Instant Form,
                  messaging destination and app destination intent for
                  single-image, video and carousel creatives. Production
                  requires eligible linked Page/app/form assets, media uploads,
                  `object_story_spec` or `asset_feed_spec`, and the AdCreative →
                  Ad creation sequence. Some objective/destination combinations
                  remain account- and API-version-dependent.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">
                    Reusable Asset Library
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Add an image, logo or video once and select it in supported
                    creative fields.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceView("assets");
                    setAssetNotice("");
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Manage library
                </button>
              </div>
              {assetLibrary.length === 0 ? (
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                  No assets added yet. Open Asset Library to add reusable media
                  URLs for this prototype.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {assetLibrary.slice(0, 4).map((asset) => (
                    <div
                      key={asset.id}
                      className="rounded-xl border border-slate-200 p-3"
                    >
                      <p className="text-sm font-semibold text-slate-800">
                        {asset.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {asset.kind} · {asset.url}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {asset.kind === "IMAGE" &&
                          selectedPlatforms.includes("metaAds") && (
                            <button
                              type="button"
                              onClick={() => useLibraryAsset(asset, "meta")}
                              className="text-xs font-semibold text-blue-700"
                            >
                              Use for Meta
                            </button>
                          )}
                        {asset.kind === "IMAGE" &&
                          googleCampaignType === "PERFORMANCE_MAX" && (
                            <button
                              type="button"
                              onClick={() =>
                                useLibraryAsset(asset, "pmax-landscape")
                              }
                              className="text-xs font-semibold text-blue-700"
                            >
                              Use as PMax image
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {workspaceView === "builder" && step === 5 && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold">Review your unified campaign</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review each provider independently before preparing the combined
              request.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="font-bold">Shared Campaign Brief</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Business", businessName],
                ["Campaign", campaignName],
                ["Website", websiteUrl || "Not provided"],
                ["Objective", selectedObjective?.label || "Not selected"],
                [
                  "Platforms",
                  selectedPlatforms
                    .map((item) =>
                      item === "googleAds" ? "Google Ads" : "Meta Ads",
                    )
                    .join(" + "),
                ],
                ["Description", description || "Not provided"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs font-medium uppercase text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-6">
            <h3 className="text-lg font-bold text-slate-900">
              Budget & Bidding API Workflow
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Budget and bidding are first-class API resources/settings—not just
              form values. The following provider-specific operations are
              included in this request plan.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {selectedPlatforms.includes("googleAds") && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-slate-900">Google Ads</p>
                  <p className="mt-2 text-sm text-slate-700">
                    <strong>Budget resource:</strong> CampaignBudget
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Operation:</strong>{" "}
                    CampaignBudgetService.MutateCampaignBudgets
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Period:</strong>{" "}
                    {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                      ? "CUSTOM_PERIOD / total_amount_micros"
                      : "DAILY / amount_micros"}
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Amount:</strong>{" "}
                    {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                      ? googleCampaignTotalBudget
                      : googleDailyBudget}{" "}
                    {selectedCurrency(connections.googleAds)}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    <strong>Bidding resource:</strong>{" "}
                    {effectiveGoogleBiddingScope === "PORTFOLIO"
                      ? "BiddingStrategy (portfolio)"
                      : "Campaign.campaign_bidding_strategy (standard)"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Create/resolve budget → attach its resource name to Campaign
                    → create the remaining child resources. Update the existing
                    CampaignBudget when changing budget amounts; avoid replacing
                    it without considering spend history.
                  </p>
                </div>
              )}
              {selectedPlatforms.includes("metaAds") && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-slate-900">Meta Ads</p>
                  <p className="mt-2 text-sm text-slate-700">
                    <strong>Budget owner:</strong>{" "}
                    {metaBudgetLevel === "CAMPAIGN"
                      ? "Campaign (CBO)"
                      : "Ad Set (ABO)"}
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Budget field:</strong>{" "}
                    {metaBudgetMode === "DAILY"
                      ? "daily_budget"
                      : "lifetime_budget"}
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Bidding owner:</strong>{" "}
                    {metaBudgetLevel === "CAMPAIGN" ? "Campaign" : "Ad Set"}
                  </p>
                  <p className="text-sm text-slate-700">
                    <strong>Ad Set delivery:</strong> optimization_goal +
                    billing_event
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Create Campaign → create Ad Set. Include the budget at one
                    level only; convert to currency minor units based on the
                    account currency.
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4 rounded-lg border border-indigo-100 bg-white p-3 text-xs leading-5 text-slate-600">
              <strong>Budget management after creation:</strong> Google updates
              use CampaignBudgetService; standard bidding updates use
              CampaignService and portfolio strategy updates use
              BiddingStrategyService. Meta updates target the Campaign or Ad Set
              that owns the budget. Read-back should compare configured budget
              with remaining budget and spend metrics.
            </div>
          </div>

          {selectedPlatforms.includes("googleAds") && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">Google Ads Configuration</h3>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>
                  <strong>Account:</strong>{" "}
                  {selectedAccountLabel(connections.googleAds)}
                </p>
                <p>
                  <strong>Campaign Type:</strong>{" "}
                  {
                    googleCampaignTypes.find(
                      (item) => item.value === googleCampaignType,
                    )?.label
                  }
                </p>
                <p>
                  <strong>Google API Channel:</strong>{" "}
                  {
                    googleCampaignTypes.find(
                      (item) => item.value === googleCampaignType,
                    )?.channelType
                  }
                </p>
                <p>
                  <strong>Google Marketing Objective:</strong>{" "}
                  {googleMarketingObjective}
                </p>
                <p>
                  <strong>EU Political Advertising:</strong>{" "}
                  {googleEuPoliticalStatus || "Not declared"}
                </p>
                {googleCampaignType === "APP" ? (
                  <>
                    <p>
                      <strong>App subtype:</strong> {googleAppSubtype}
                    </p>
                    <p>
                      <strong>App goal:</strong> {effectiveGoogleAppGoal}
                    </p>
                    <p>
                      <strong>App ID:</strong> {googleAppId}
                    </p>
                  </>
                ) : googleCampaignType === "HOTEL" ? (
                  <>
                    <p>
                      <strong>Hotel Center ID:</strong> {googleHotelCenterId}
                    </p>
                    <p>
                      <strong>Hotel bidding:</strong> {googleHotelBidStrategy}
                    </p>
                  </>
                ) : googleCampaignType === "SHOPPING" ? (
                  <>
                    <p>
                      <strong>Merchant Center ID:</strong>{" "}
                      {googleMerchantCenterId}
                    </p>
                    <p>
                      <strong>Campaign priority:</strong>{" "}
                      {googleShoppingPriority}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong>Performance Goal:</strong>{" "}
                      {
                        availableGooglePerformanceGoals.find(
                          (item) =>
                            item.value === effectiveGooglePerformanceGoal,
                        )?.label
                      }
                    </p>
                    <p>
                      <strong>Bidding Method:</strong>{" "}
                      {effectiveGoogleBiddingMode}
                    </p>
                    <p>
                      <strong>API Bidding Strategy:</strong>{" "}
                      {effectiveGoogleBiddingStrategy}
                    </p>
                  </>
                )}
                <p>
                  <strong>Budget Type:</strong>{" "}
                  {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                    ? "Campaign total"
                    : "Average daily"}
                </p>
                <p>
                  <strong>Budget Amount:</strong>{" "}
                  {effectiveGoogleBudgetMode === "CAMPAIGN_TOTAL"
                    ? googleCampaignTotalBudget
                    : googleDailyBudget}{" "}
                  {selectedCurrency(connections.googleAds)}
                </p>
                <p>
                  <strong>Budget API:</strong> CampaignBudgetService →
                  Campaign.campaign_budget
                </p>
                <p>
                  <strong>Bidding Scope:</strong> {effectiveGoogleBiddingScope}
                </p>
                {effectiveGoogleBiddingScope === "PORTFOLIO" && (
                  <p>
                    <strong>Portfolio Strategy:</strong>{" "}
                    {googlePortfolioStrategyResourceName}
                  </p>
                )}
                {googleCampaignType === "PERFORMANCE_MAX" ? (
                  <>
                    <p>
                      <strong>Asset Group:</strong> {pmaxAssetGroupName}
                    </p>
                    <p>
                      <strong>Final URL:</strong> {pmaxFinalUrl || websiteUrl}
                    </p>
                    <p>
                      <strong>Headlines / Descriptions:</strong>{" "}
                      {
                        pmaxHeadlines.split("\n").filter((item) => item.trim())
                          .length
                      }{" "}
                      /{" "}
                      {
                        pmaxDescriptions
                          .split("\n")
                          .filter((item) => item.trim()).length
                      }
                    </p>
                    <p>
                      <strong>Business Name:</strong> {pmaxBusinessName}
                    </p>
                    <p>
                      <strong>Search Themes:</strong>{" "}
                      {
                        pmaxSearchThemes
                          .split("\n")
                          .filter((item) => item.trim()).length
                      }
                    </p>
                    <p>
                      <strong>Audience Signals:</strong>{" "}
                      {
                        pmaxAudienceResourceNames
                          .split(/[\n,]+/)
                          .filter((item) => item.trim()).length
                      }
                    </p>
                  </>
                ) : googleCampaignType === "HOTEL" ? (
                  <>
                    <p>
                      <strong>Hotel Ad Group:</strong> {googleHotelAdGroupName}
                    </p>
                    <p>
                      <strong>Targeting:</strong> {googleHotelTargetCountry} ·{" "}
                      {googleHotelLanguage}
                    </p>
                    <p>
                      <strong>Hotel selection:</strong>{" "}
                      {googleHotelListingMode === "ALL_HOTELS"
                        ? "All hotels"
                        : `${googleHotelPropertyIds.split(/[\n,]+/).filter((item) => item.trim()).length} selected properties`}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong>Ad Group:</strong> {googleAdGroupName}
                    </p>
                    {googleCampaignType === "SEARCH" && (
                      <>
                        <p>
                          <strong>Keywords:</strong>{" "}
                          {
                            googleKeywordLines
                              .split("\n")
                              .filter((item) => item.trim()).length
                          }{" "}
                          ({googleKeywordMatchType})
                        </p>
                        <p>
                          <strong>Responsive Search Ad:</strong>{" "}
                          {
                            googleSearchHeadlines
                              .split("\n")
                              .filter((item) => item.trim()).length
                          }{" "}
                          headlines ·{" "}
                          {
                            googleSearchDescriptions
                              .split("\n")
                              .filter((item) => item.trim()).length
                          }{" "}
                          descriptions
                        </p>
                        <p>
                          <strong>Ad Final URL:</strong>{" "}
                          {googleSearchFinalUrl || websiteUrl}
                        </p>
                      </>
                    )}
                  </>
                )}
                {googleCampaignType === "SEARCH" && (
                  <p>
                    <strong>Search Partners / Display expansion:</strong>{" "}
                    {googleSearchPartners ? "On" : "Off"} /{" "}
                    {googleDisplayExpansion ? "On" : "Off"}
                  </p>
                )}
              </div>
            </div>
          )}

          {selectedPlatforms.includes("metaAds") && objective && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">Meta Ads Configuration</h3>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>
                  <strong>Account:</strong>{" "}
                  {selectedAccountLabel(connections.metaAds)}
                </p>
                <p>
                  <strong>Objective:</strong> {metaObjectiveMap[objective]}
                </p>
                <p>
                  <strong>Buying Type:</strong> {metaBuyingType}
                </p>
                <p>
                  <strong>Budget Level:</strong>{" "}
                  {metaBudgetLevel === "CAMPAIGN"
                    ? "Campaign-level"
                    : "Ad set-level"}
                </p>
                <p>
                  <strong>Budget Type:</strong> {metaBudgetMode}
                </p>
                <p>
                  <strong>Budget Amount:</strong>{" "}
                  {metaBudgetMode === "DAILY"
                    ? metaDailyBudget
                    : metaLifetimeBudget}{" "}
                  {selectedCurrency(connections.metaAds)}
                </p>
                <p>
                  <strong>Budget API Owner:</strong>{" "}
                  {metaBudgetLevel === "CAMPAIGN"
                    ? "Campaign (CBO)"
                    : "Ad Set (ABO)"}
                </p>
                <p>
                  <strong>Performance Goal (Ad Set):</strong>{" "}
                  {effectiveMetaOptimizationGoal}
                </p>
                <p>
                  <strong>Billing Event:</strong> {effectiveMetaBillingEvent}
                </p>
                <p>
                  <strong>Targeting:</strong> {metaCountries.toUpperCase()} ·{" "}
                  {metaSpecialAdCategories.length
                    ? "Special-category restrictions apply"
                    : `Ages ${metaAgeMin}–${metaAgeMax} · ${metaGender === "ALL" ? "All genders" : metaGender}`}
                </p>
                <p>
                  <strong>Bid Strategy:</strong> {metaBidStrategy}
                </p>
                {metaBidAmount && (
                  <p>
                    <strong>Bid Amount:</strong> {metaBidAmount}{" "}
                    {selectedCurrency(connections.metaAds)}
                  </p>
                )}
                {metaMinimumRoas && (
                  <p>
                    <strong>Minimum ROAS:</strong> {metaMinimumRoas}
                  </p>
                )}
                <p>
                  <strong>Special Ad Category:</strong>{" "}
                  {metaSpecialAdCategories.length
                    ? metaSpecialAdCategories.join(", ")
                    : "None"}
                </p>
                <p>
                  <strong>Ad Set:</strong> {metaAdSetName}
                </p>
                <p>
                  <strong>Facebook Page ID:</strong> {metaPageId}
                </p>
                <p>
                  <strong>Pixel ID:</strong> {metaPixelId || "Not provided"}
                </p>
                <p>
                  <strong>Creative:</strong> {metaAdHeadline} ·{" "}
                  {metaCallToAction}
                </p>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="font-bold">Campaign structure and ad drafts</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {selectedPlatforms.includes("googleAds") && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Google Ads hierarchy
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {googleCampaignType === "PERFORMANCE_MAX"
                      ? "Campaign → Asset Group → Assets"
                      : googleCampaignType === "APP"
                        ? "Campaign → Ad Group → App Assets / App Ad"
                        : googleCampaignType === "HOTEL"
                          ? "Campaign → Ad Group → Hotel Listing Groups / Hotel Ads"
                          : "Campaign → Ad Group → Ad"}
                  </p>
                </div>
              )}
              {selectedPlatforms.includes("metaAds") && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Meta Ads hierarchy
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Campaign → Ad Set → Ad → Creative
                  </p>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Campaign details, provider-specific groups and ad sets, and
              creative drafts are prepared together in this prototype. In
              production, each provider resource will be created and tracked
              independently.
            </p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">Launch safety</p>
            <p className="mt-1 text-sm leading-6 text-blue-800">
              The request sets the initial status to PAUSED. Google and Meta
              campaign creation results should be tracked separately, so one
              provider's failure does not hide the other provider's result.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <label className="block text-sm font-semibold text-slate-800">
              Backend execution mode
            </label>

            <select
              value={executionMode}
              onChange={(event) => {
                setExecutionMode(event.target.value as CampaignExecutionMode);
                setApiPayloadPreview("");
              }}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="VALIDATE_ONLY">
                Validate only — no provider mutations
              </option>
              <option value="LIVE">
                Live execution — create paused provider resources
              </option>
            </select>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              This setting controls the backend request preview. Preparing the
              request does not submit it or create campaigns.
            </p>
          </div>
          <button
            type="button"
            onClick={prepareCampaign}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Prepare Unified Campaign Request
          </button>

          {preparedPayload && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold">
                    Unified Campaign Request Preview
                  </h3>
                  <button
                    type="button"
                    onClick={copyPayload}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    Copy JSON
                  </button>
                </div>
                {copyNotice && (
                  <p className="mt-3 text-sm text-green-700">{copyNotice}</p>
                )}
                <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-green-300">
                  {preparedPayload}
                </pre>
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800">
                  Preparing this preview does not submit the campaign request.
                  The Backend API Request Preview below contains the separate
                  payload submitted to POST /api/campaigns. Validate-only mode
                  performs Google Ads validation and Meta local configuration
                  validation without creating provider resources. Meta
                  validation is not a remote Graph API dry run. Live execution
                  sends real provider API mutations. Successfully created
                  resources are intended to start PAUSED. A provider can
                  partially succeed if a dependent resource fails. The current
                  creation scope is Google Search campaigns and Meta
                  single-image website campaigns. Settings not included in the
                  backend request are not applied by this operation.
                </p>
              </div>

              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                      Prototype simulation
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">
                      Campaign creation results
                    </h3>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                      Test how the application should report independent
                      provider outcomes. These are mock responses only; no
                      campaign is sent to Google or Meta.
                    </p>
                  </div>
                  <span className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                    Mock API mode
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        value: "ALL_SUCCESS",
                        title: "Both platforms succeed",
                        description: "All selected resources are created.",
                      },
                      {
                        value: "PROVIDER_FAILURE",
                        title: "One provider fails",
                        description:
                          "Google succeeds while Meta fails (or the only selected provider fails).",
                      },
                      {
                        value: "ALL_FAILURE",
                        title: "All platforms fail",
                        description:
                          "Each selected provider returns a campaign-level error.",
                      },
                      {
                        value: "RESOURCE_FAILURE",
                        title: "A child resource fails",
                        description:
                          "Campaign succeeds, but an Ad Group or Ad Set fails.",
                      },
                      {
                        value: "TIMEOUT",
                        title: "Request timeout / unknown result",
                        description:
                          "A request times out; dependent steps are blocked pending reconciliation.",
                      },
                    ] as {
                      value: DemoScenario;
                      title: string;
                      description: string;
                    }[]
                  ).map((scenario) => (
                    <button
                      key={scenario.value}
                      type="button"
                      onClick={() => runDemoScenario(scenario.value)}
                      className="rounded-xl border border-indigo-200 bg-white p-4 text-left transition hover:border-indigo-400 hover:shadow-sm"
                    >
                      <span className="block text-sm font-semibold text-slate-900">
                        {scenario.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {scenario.description}
                      </span>
                      <span className="mt-3 inline-block text-xs font-bold text-indigo-700">
                        Run scenario →
                      </span>
                    </button>
                  ))}
                </div>

                {demoJob && (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Creation job
                        </p>
                        <h4 className="mt-1 font-bold text-slate-900">
                          {demoJob.jobId}
                        </h4>
                        <p className="mt-1 text-xs text-slate-500">
                          {demoJob.createdAt}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${demoJob.overallStatus === "SUCCESS" ? "bg-green-100 text-green-800" : demoJob.overallStatus === "FAILED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
                      >
                        {demoJob.overallStatus === "SUCCESS"
                          ? "Success"
                          : demoJob.overallStatus === "FAILED"
                            ? "Failed"
                            : "Partial success"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      {demoJob.providers.map((provider) => {
                        const providerLabel =
                          provider.provider === "googleAds"
                            ? "Google Ads"
                            : "Meta Ads";
                        const failedResources = provider.resources.filter(
                          (resource) => resource.status === "FAILED",
                        ).length;
                        const timedOutResources = provider.resources.filter(
                          (resource) => resource.status === "TIMED_OUT",
                        ).length;
                        const pendingResources = provider.resources.filter(
                          (resource) =>
                            resource.status === "NOT_STARTED" ||
                            resource.status === "BLOCKED",
                        ).length;
                        return (
                          <div
                            key={provider.provider}
                            className="rounded-xl border border-slate-200 p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h5 className="font-bold text-slate-900">
                                {providerLabel}
                              </h5>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${provider.status === "SUCCESS" ? "bg-green-100 text-green-800" : provider.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
                              >
                                {provider.status === "SUCCESS"
                                  ? "Created"
                                  : provider.status === "FAILED"
                                    ? "Failed"
                                    : "Partially created"}
                              </span>
                            </div>
                            <div className="mt-4 space-y-3">
                              {provider.resources.map((resource) => (
                                <div
                                  key={resource.key}
                                  className="flex items-start gap-3"
                                >
                                  <span
                                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${resource.status === "SUCCESS" ? "bg-green-100 text-green-700" : resource.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}
                                  >
                                    {resource.status === "SUCCESS"
                                      ? "✓"
                                      : resource.status === "FAILED"
                                        ? "!"
                                        : resource.status === "TIMED_OUT"
                                          ? "?"
                                          : resource.status === "BLOCKED"
                                            ? "Ⅱ"
                                            : "–"}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-sm font-semibold text-slate-800">
                                        {resource.label}
                                      </span>
                                      <span
                                        className={`text-xs font-semibold ${resource.status === "SUCCESS" ? "text-green-700" : resource.status === "FAILED" ? "text-red-700" : "text-slate-500"}`}
                                      >
                                        {resource.status === "SUCCESS"
                                          ? "Success"
                                          : resource.status === "FAILED"
                                            ? "Failed"
                                            : resource.status === "TIMED_OUT"
                                              ? "Timed out — reconcile"
                                              : resource.status === "BLOCKED"
                                                ? "Blocked by dependency"
                                                : "Not started"}
                                      </span>
                                    </div>
                                    {resource.resourceId && (
                                      <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                                        ID: {resource.resourceId}
                                      </p>
                                    )}
                                    {resource.endpoint && (
                                      <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
                                        {resource.endpoint}
                                      </p>
                                    )}
                                    {resource.requestId && (
                                      <p className="mt-1 font-mono text-[10px] text-slate-400">
                                        Request: {resource.requestId} · Attempt:{" "}
                                        {resource.attemptCount ?? 1}
                                      </p>
                                    )}
                                    {resource.responseSummary && (
                                      <p className="mt-1 text-[11px] text-slate-500">
                                        {resource.responseSummary}
                                      </p>
                                    )}
                                    {resource.errorMessage && (
                                      <div className="mt-2 rounded-lg bg-red-50 p-3">
                                        <p className="text-[11px] font-bold uppercase text-red-700">
                                          {resource.errorCode}
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-red-700">
                                          {resource.errorMessage}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {(failedResources > 0 ||
                              timedOutResources > 0 ||
                              pendingResources > 0) && (
                              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                                {timedOutResources > 0 && (
                                  <div className="w-full space-y-2">
                                    <p className="text-xs font-medium text-amber-700">
                                      Do not retry timed-out requests yet. First
                                      query the provider account to determine
                                      whether the resource was created.
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        reconcileDemoTimeout(provider.provider)
                                      }
                                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                    >
                                      Simulate reconciliation lookup
                                    </button>
                                  </div>
                                )}
                                {failedResources > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      retryDemoFailedSteps(provider.provider)
                                    }
                                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                                  >
                                    Retry failed step
                                    {failedResources > 1 ? "s" : ""}
                                  </button>
                                )}
                                {pendingResources > 0 &&
                                  failedResources === 0 &&
                                  timedOutResources === 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        continueDemoProvider(provider.provider)
                                      }
                                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                      Continue remaining steps
                                    </button>
                                  )}
                              </div>
                            )}
                            {failedResources > 0 && pendingResources > 0 && (
                              <p className="mt-2 text-xs text-slate-500">
                                Retry the failed resource first. Then continue
                                the resources that depend on it.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                      <strong>Demo behavior:</strong> successful resource IDs
                      are retained. Failed steps can be retried; blocked steps
                      wait for their dependency. A timeout is an unknown
                      outcome, not proof of failure: reconcile by querying the
                      provider before retrying to avoid duplicate resources.
                      Endpoint names, IDs and responses are illustrative, not
                      live provider records.
                    </div>
                  </div>
                )}
              </div>
              {/* {apiPayloadPreview && (
                <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
                  <h3 className="font-bold text-slate-900">
                    Backend API Request Preview
                  </h3>

                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    This is the separate request body for POST /api/campaigns.
                    It contains only the fields needed by the backend provider
                    adapters.
                  </p>

                  <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-green-300">
                    {apiPayloadPreview}
                  </pre>
                </div>
              )} */}

              <div className="mt-5 border-t border-slate-200 pt-5">
                <button
                  type="button"
                  onClick={submitCampaignRequest}
                  disabled={campaignSubmitting || !apiPayloadPreview}
                  className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {campaignSubmitting
                    ? "Submitting campaign request..."
                    : executionMode === "LIVE"
                      ? "Create Paused Campaigns"
                      : "Validate Campaign Request"}
                </button>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {executionMode === "VALIDATE_ONLY"
                    ? "This submits the request for backend validation. Google and Meta provider resources will not be created."
                    : "This submits a live request. Successfully created provider resources will start PAUSED."}
                </p>

                {campaignApiError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-800">
                      Campaign request error
                    </p>

                    <p className="mt-1 text-sm text-red-700">
                      {campaignApiError}
                    </p>
                  </div>
                )}

                {campaignApiResponse && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-semibold text-slate-900">
                      Backend Execution Result
                    </h4>

                    <pre className="mt-3 max-h-[500px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                      {JSON.stringify(campaignApiResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {workspaceView === "creative" && (
        <section className="mt-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-violet-700">
                Creative workspace
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                AI Creative Studio
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Create campaign-ready concepts for Google Ads and Meta Ads,
                review variations, then attach approved assets to your campaign
                draft and reusable library.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWorkspaceView("builder")}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to Campaign Builder
            </button>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
            <strong>Prototype mode:</strong> Generate Variations creates local
            demo concepts only. It does not call an AI model, create real
            image/video files, upload media, or publish to Google/Meta.
            Production will need an AI generation service, secure asset storage,
            media processing and provider upload adapters.
          </div>

          <div
            className={`grid gap-5 ${selectedPlatforms.includes("metaAds") ? "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : "lg:grid-cols-1"}`}
          >
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold text-slate-900">Creative brief</h3>
              <p className="mt-1 text-xs text-slate-500">
                Use your campaign brief as a starting point, then refine the art
                direction.
              </p>
              <div className="mt-4">
                <label className={labelClass}>
                  Prompt / creative direction *
                </label>
                <textarea
                  rows={6}
                  value={creativePrompt}
                  onChange={(e) => setCreativePrompt(e.target.value)}
                  className={inputClass}
                  placeholder="Describe the product, audience, message, mood, colours and visual direction..."
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Media type</label>
                  <select
                    value={creativeKind}
                    onChange={(e) => {
                      setCreativeKind(e.target.value as "IMAGE" | "VIDEO");
                      setCreativeVariations([]);
                      setSelectedCreativeId(null);
                    }}
                    className={inputClass}
                  >
                    <option value="IMAGE">Image creative</option>
                    <option value="VIDEO">Video creative</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Visual style</label>
                  <select
                    value={creativeStyle}
                    onChange={(e) => setCreativeStyle(e.target.value)}
                    className={inputClass}
                  >
                    <option>Premium lifestyle</option>
                    <option>Minimal product focus</option>
                    <option>Bold promotional</option>
                    <option>Editorial / magazine</option>
                    <option>Playful and energetic</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Aspect ratio</label>
                  <select
                    value={creativeAspectRatio}
                    onChange={(e) =>
                      setCreativeAspectRatio(
                        e.target.value as CreativeAspectRatio,
                      )
                    }
                    className={inputClass}
                  >
                    <option value="1:1">Square · 1:1</option>
                    <option value="4:5">Portrait feed · 4:5</option>
                    <option value="9:16">Stories / Reels · 9:16</option>
                    <option value="16:9">Landscape / video · 16:9</option>
                  </select>
                </div>
                {selectedPlatforms.includes("googleAds") &&
                  !["SEARCH", "SHOPPING", "HOTEL"].includes(
                    googleCampaignType,
                  ) &&
                  !(
                    googleCampaignType === "DEMAND_GEN" &&
                    ["VIDEO_RESPONSIVE", "PRODUCT_FEED"].includes(
                      googleDemandGenFormat,
                    )
                  ) && (
                    <div>
                      <label className={labelClass}>
                        Google Ads output format / ratio
                      </label>
                      <select
                        value={googleCreativeAspectRatio}
                        onChange={(e) =>
                          setGoogleCreativeAspectRatio(
                            e.target.value as CreativeAspectRatio,
                          )
                        }
                        className={inputClass}
                      >
                        {googleCampaignType === "PERFORMANCE_MAX" ? (
                          <>
                            <option value="1.91:1">
                              Landscape image · 1.91:1
                            </option>
                            <option value="1:1">Square image · 1:1</option>
                            <option value="4:5">Portrait image · 4:5</option>
                          </>
                        ) : googleCampaignType === "DISPLAY" ? (
                          <>
                            <option value="1.91:1">
                              Landscape image · 1.91:1
                            </option>
                            <option value="1:1">Square image · 1:1</option>
                          </>
                        ) : googleCampaignType === "APP" ? (
                          <>
                            <option value="1:1">Square image · 1:1</option>
                            <option value="4:5">Portrait image · 4:5</option>
                            <option value="16:9">Landscape video · 16:9</option>
                            <option value="9:16">Vertical video · 9:16</option>
                          </>
                        ) : (
                          <>
                            <option value="1.91:1">
                              Landscape image · 1.91:1
                            </option>
                            <option value="1:1">Square image · 1:1</option>
                            <option value="4:5">Portrait image · 4:5</option>
                            <option value="16:9">Landscape video · 16:9</option>
                            <option value="9:16">Vertical video · 9:16</option>
                          </>
                        )}
                      </select>
                      <p className="mt-1 text-[10px] leading-4 text-slate-500">
                        Separate from the Meta crop above. The prototype creates
                        a separate Google-format demo reference; actual resizing
                        / media rendering is a production task.
                      </p>
                    </div>
                  )}
                <div>
                  <label className={labelClass}>Campaign platforms</label>
                  <div className="mt-2 flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    {selectedPlatforms.length ? (
                      selectedPlatforms.map((provider) => (
                        <span
                          key={provider}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
                        >
                          {provider === "googleAds" ? "Google Ads" : "Meta Ads"}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">
                        Choose platforms in Campaign Basics first.
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={generateCreativeVariations}
                className="mt-5 w-full rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800"
              >
                ✦ Generate 3 demo variations
              </button>
              {creativeStudioNotice && (
                <p className="mt-3 rounded-xl bg-violet-50 p-3 text-xs leading-5 text-violet-800">
                  {creativeStudioNotice}
                </p>
              )}
            </div>

            {selectedPlatforms.includes("metaAds") && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Meta Ads · Social creative previews
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Select one concept to review and attach to the campaign.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">
                    {creativeVariations.length} concepts
                  </span>
                </div>
                {creativeVariations.length === 0 ? (
                  <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                    <div className="text-4xl text-violet-400">✦</div>
                    <p className="mt-3 font-semibold text-slate-800">
                      Your concepts will appear here
                    </p>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                      Enter a brief and generate variations to explore different
                      creative directions.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {creativeVariations.map((variation, index) => {
                      const selected = selectedCreativeId === variation.id;
                      const aspectClass =
                        variation.aspectRatio === "9:16"
                          ? "aspect-[9/16]"
                          : variation.aspectRatio === "4:5"
                            ? "aspect-[4/5]"
                            : variation.aspectRatio === "16:9"
                              ? "aspect-video"
                              : variation.aspectRatio === "1.91:1"
                                ? "aspect-[1.91/1]"
                                : "aspect-square";
                      const themeClass =
                        index === 0
                          ? "from-violet-900 via-fuchsia-700 to-orange-300"
                          : index === 1
                            ? "from-sky-900 via-cyan-700 to-emerald-300"
                            : "from-amber-700 via-rose-600 to-violet-500";
                      return (
                        <button
                          key={variation.id}
                          type="button"
                          onClick={() => setSelectedCreativeId(variation.id)}
                          className={`overflow-hidden rounded-xl border text-left transition ${selected ? "border-violet-600 ring-2 ring-violet-200" : "border-slate-200 hover:border-violet-300"}`}
                        >
                          <div
                            className={`${aspectClass} relative flex flex-col justify-between overflow-hidden bg-gradient-to-br ${themeClass} p-3 text-white`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="rounded-full bg-black/20 px-2 py-1 text-[9px] font-bold uppercase tracking-wide">
                                {variation.kind} · Demo
                              </span>
                              {variation.kind === "VIDEO" && (
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-sm text-violet-800">
                                  ▶
                                </span>
                              )}
                            </div>
                            <div className="relative">
                              <div className="mb-2 h-1 w-8 rounded-full bg-white/80" />
                              <p className="text-base font-black leading-tight">
                                {variation.headline}
                              </p>
                              <p className="mt-1 text-[10px] leading-4 text-white/90">
                                {variation.previewLabel}
                              </p>
                              <div className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-slate-900">
                                {variation.callToAction.replaceAll("_", " ")}
                              </div>
                            </div>
                          </div>
                          <div className="p-3">
                            <p className="text-xs font-bold text-slate-900">
                              {variation.name}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-500">
                              {variation.styleLabel} · {variation.aspectRatio}
                            </p>
                            <p className="mt-2 line-clamp-3 text-[11px] leading-4 text-slate-600">
                              {variation.primaryText}
                            </p>
                            <p
                              className={`mt-3 text-[10px] font-bold ${attachedCreativeAssetIds.includes(variation.id) ? "text-emerald-700" : selected ? "text-violet-700" : "text-slate-400"}`}
                            >
                              {attachedCreativeAssetIds.includes(variation.id)
                                ? "✓ Approved & attached"
                                : selected
                                  ? "✓ Selected for review"
                                  : "Select concept"}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {creativeVariations.some(
                  (item) => item.id === selectedCreativeId,
                ) && (
                  <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4">
                    {(() => {
                      const selected = creativeVariations.find(
                        (item) => item.id === selectedCreativeId,
                      )!;
                      return (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-violet-950">
                                {selected.name}
                              </p>
                              <p className="mt-1 text-[11px] text-violet-800">
                                Review copy and media reference
                              </p>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-violet-700">
                              {attachedCreativeAssetIds.includes(selected.id)
                                ? "Approved & attached"
                                : "Pending approval"}
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-900">
                            {selected.headline}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {selected.primaryText}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                attachCreativeToCampaign(selected, "META")
                              }
                              className="rounded-lg bg-violet-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-800"
                            >
                              Approve & attach to Meta Ads
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setNewAssetName(selected.name);
                                setNewAssetKind(selected.kind);
                                setNewAssetUrl(selected.url);
                                setAssetNotice(
                                  "Review this demo creative reference before adding it to your library.",
                                );
                                setWorkspaceView("assets");
                              }}
                              className="rounded-lg border border-violet-200 bg-white px-4 py-2.5 text-xs font-semibold text-violet-700"
                            >
                              Review in Asset Library
                            </button>
                          </div>
                          <p className="mt-3 break-all text-[10px] leading-4 text-slate-500">
                            Demo media reference: {selected.url}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedPlatforms.includes("googleAds") && (
            <div className="rounded-2xl border border-blue-200 bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                    Google Ads · Platform-specific output
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">
                    {googleCampaignType === "SEARCH"
                      ? "Responsive Search Ad (text assets)"
                      : googleCampaignType === "PERFORMANCE_MAX"
                        ? "Performance Max asset group"
                        : googleCampaignType === "DISPLAY"
                          ? "Responsive Display Ad asset set"
                          : googleCampaignType === "DEMAND_GEN"
                            ? `Demand Gen · ${googleDemandGenFormat.replaceAll("_", " ")}`
                            : googleCampaignType === "APP"
                              ? "App campaign asset set"
                              : googleCampaignType === "SHOPPING"
                                ? "Merchant Center product feed"
                                : googleCampaignType === "HOTEL"
                                  ? "Hotel Center listing workflow"
                                  : "Google Ads assets"}
                  </h3>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                    Google Ads does not use one universal social-post format.
                    This panel builds the asset package and preview for the
                    selected Google campaign type.
                  </p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-blue-800">
                  {googleCampaignType}
                </span>
              </div>
              {creativeVariations.find(
                (item) => item.id === selectedCreativeId,
              ) ? (
                (() => {
                  const googleVariation = creativeVariations.find(
                    (item) => item.id === selectedCreativeId,
                  )!;
                  const pack = googleVariation.googlePack;
                  const googleUsesVisualRatio =
                    !["SEARCH", "SHOPPING", "HOTEL"].includes(
                      googleCampaignType,
                    ) &&
                    !(
                      googleCampaignType === "DEMAND_GEN" &&
                      ["VIDEO_RESPONSIVE", "PRODUCT_FEED"].includes(
                        googleDemandGenFormat,
                      )
                    );
                  const googlePackMatches =
                    pack.campaignType === googleCampaignType &&
                    (googleCampaignType !== "DEMAND_GEN" ||
                      pack.subFormat === googleDemandGenFormat) &&
                    (!googleUsesVisualRatio ||
                      googleVariation.googleAspectRatio ===
                        googleCreativeAspectRatio);
                  if (!googlePackMatches) {
                    return (
                      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm font-bold text-amber-900">
                          Google campaign format changed
                        </p>
                        <p className="mt-1 text-xs leading-5 text-amber-800">
                          This concept was generated for {pack.formatLabel}.
                          Generate new variations to build the correct Google
                          asset package for the current {googleCampaignType}
                          {googleCampaignType === "DEMAND_GEN"
                            ? ` / ${googleDemandGenFormat}`
                            : ""}{" "}
                          format.
                        </p>
                      </div>
                    );
                  }
                  const displayDomain = (() => {
                    try {
                      return new URL(pack.finalUrl).hostname;
                    } catch {
                      return "example.com";
                    }
                  })();
                  const ratioMatchesPmax =
                    googleVariation.googleAspectRatio === "1.91:1" ||
                    googleVariation.googleAspectRatio === "1:1" ||
                    googleVariation.googleAspectRatio === "4:5";
                  return (
                    <div className="mt-5 space-y-4">
                      {googleCampaignType === "SEARCH" && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              Google Search · Responsive Search Ad preview
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500">
                              TEXT-ONLY AD
                            </span>
                          </div>
                          <div className="max-w-2xl rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-[11px] text-emerald-800">
                              {displayDomain} ›{" "}
                              {pack.finalUrl
                                .replace(/^https?:\/\//, "")
                                .split("/")
                                .slice(1, 3)
                                .join(" › ")}
                            </p>
                            <p className="mt-1 text-lg leading-6 text-blue-800">
                              {pack.headlines.slice(0, 3).join(" | ")}
                            </p>
                            <p className="mt-2 text-sm leading-5 text-slate-700">
                              {pack.descriptions[0]} {pack.descriptions[1]}
                            </p>
                          </div>
                          <p className="mt-3 text-[10px] text-slate-500">
                            Responsive Search Ads support 3–15 headlines and 2–4
                            descriptions. This demo pack contains{" "}
                            {pack.headlines.length} headlines and{" "}
                            {pack.descriptions.length} descriptions.
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg bg-blue-50 p-3">
                              <p className="text-xs font-bold text-blue-900">
                                {pack.headlines.length} headlines
                              </p>
                              <p className="mt-1 text-[11px] leading-4 text-blue-800">
                                {pack.headlines.join(" · ")}
                              </p>
                            </div>
                            <div className="rounded-lg bg-blue-50 p-3">
                              <p className="text-xs font-bold text-blue-900">
                                {pack.descriptions.length} descriptions
                              </p>
                              <p className="mt-1 text-[11px] leading-4 text-blue-800">
                                {pack.descriptions.join(" · ")}
                              </p>
                            </div>
                          </div>
                          <p className="mt-3 text-[11px] text-slate-500">
                            No image or video slot is shown here because this
                            builder's Search format is a Responsive Search Ad.
                            The visual concept stays in the library for
                            compatible campaign types.
                          </p>
                        </div>
                      )}
                      {googleCampaignType === "PERFORMANCE_MAX" && (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3">
                            {[
                              {
                                label: "Landscape image",
                                ratio: "1.91:1",
                                requirement: "Required",
                                ready:
                                  googleVariation.googleAspectRatio ===
                                  "1.91:1",
                              },
                              {
                                label: "Square image",
                                ratio: "1:1",
                                requirement: "Required",
                                ready:
                                  googleVariation.googleAspectRatio === "1:1",
                              },
                              {
                                label: "Portrait image",
                                ratio: "4:5",
                                requirement: "Optional / recommended",
                                ready:
                                  googleVariation.googleAspectRatio === "4:5",
                              },
                            ].map((slot) => (
                              <div
                                key={slot.ratio}
                                className={`rounded-xl border p-3 ${slot.ready ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-bold text-slate-800">
                                    {slot.label}
                                  </p>
                                  <span className="text-[9px] font-semibold text-slate-500">
                                    {slot.requirement}
                                  </span>
                                </div>
                                <p className="mt-1 text-[10px] text-slate-500">
                                  Target ratio {slot.ratio}
                                </p>
                                <p
                                  className={`mt-2 text-[10px] font-bold ${slot.ready ? "text-blue-800" : "text-slate-400"}`}
                                >
                                  {slot.ready
                                    ? "Selected concept matches this slot"
                                    : "Separate crop / asset needed"}
                                </p>
                              </div>
                            ))}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-xs font-bold text-slate-800">
                                Text assets
                              </p>
                              <p className="mt-1 text-[11px] text-slate-600">
                                {pack.headlines.length} headlines ·{" "}
                                {pack.longHeadlines.length} long headline ·{" "}
                                {pack.descriptions.length} descriptions
                              </p>
                              <p className="mt-2 text-xs font-semibold text-slate-800">
                                {pack.longHeadlines[0]}
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-xs font-bold text-slate-800">
                                Other asset slots
                              </p>
                              <p className="mt-1 text-[11px] leading-5 text-slate-600">
                                Square logo and optional YouTube video asset are
                                separate slots. A demo MP4 URL is not a YouTube
                                video ID.
                              </p>
                            </div>
                          </div>
                          {!ratioMatchesPmax && (
                            <p className="text-[11px] text-amber-700">
                              The current visual ratio is not a Performance Max
                              image slot ratio. Choose 1.91:1, 1:1 or 4:5 for
                              the corresponding image asset.
                            </p>
                          )}
                        </div>
                      )}
                      {googleCampaignType === "DISPLAY" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-bold text-slate-800">
                              Responsive Display asset set
                            </p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {pack.headlines[0]}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {pack.longHeadlines[0]}
                            </p>
                            <p className="mt-2 text-[11px] leading-5 text-slate-600">
                              {pack.descriptions.join(" ")}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-bold text-slate-800">
                              Image slots
                            </p>
                            <p className="mt-2 text-xs text-slate-600">
                              Landscape image (1.91:1), square image (1:1),
                              brand logo and business name are separate assets.
                              The Google-specific output ratio:{" "}
                              <strong>
                                {googleVariation.googleAspectRatio}
                              </strong>
                              .
                            </p>
                          </div>
                        </div>
                      )}
                      {googleCampaignType === "DEMAND_GEN" && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-bold text-slate-800">
                            {googleDemandGenFormat.replaceAll("_", " ")} output
                          </p>
                          {googleDemandGenFormat === "CAROUSEL" ? (
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {[1, 2, 3].map((card) => (
                                <div
                                  key={card}
                                  className="rounded-lg border border-slate-200 bg-white p-3"
                                >
                                  <span className="text-[10px] font-bold text-blue-700">
                                    CARD {card}
                                  </span>
                                  <p className="mt-2 text-xs font-semibold text-slate-800">
                                    {card === 1
                                      ? pack.headlines[0]
                                      : card === 2
                                        ? pack.headlines[1]
                                        : pack.headlines[2]}
                                  </p>
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    Individual image + destination URL required
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : googleDemandGenFormat === "VIDEO_RESPONSIVE" ? (
                            <p className="mt-2 text-xs leading-5 text-slate-600">
                              Video-responsive ads use uploaded / YouTube-hosted
                              video assets plus logo and business-name elements.
                              A post-style image preview is not the correct
                              format.
                            </p>
                          ) : googleDemandGenFormat === "PRODUCT_FEED" ? (
                            <p className="mt-2 text-xs leading-5 text-slate-600">
                              Product-feed ads are built from linked Merchant
                              Center products. Product images, titles and
                              destinations come from the feed, not from a social
                              post creative.
                            </p>
                          ) : (
                            <p className="mt-2 text-xs leading-5 text-slate-600">
                              Multi-asset output combines supported image assets
                              with headlines, descriptions and brand assets
                              across Google visual surfaces.
                            </p>
                          )}
                          <p className="mt-3 text-[11px] text-slate-500">
                            Copy: {pack.headlines.slice(0, 3).join(" · ")} ·{" "}
                            {pack.descriptions[0]}
                          </p>
                        </div>
                      )}
                      {googleCampaignType === "APP" && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-bold text-slate-800">
                            App campaign asset set
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {pack.headlines.slice(0, 3).join(" · ")}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {pack.descriptions.join(" ")}
                          </p>
                          <p className="mt-2 text-[11px] text-slate-500">
                            App campaigns combine text, images and optional
                            YouTube video assets. Video IDs must be uploaded /
                            hosted separately.
                          </p>
                        </div>
                      )}
                      {googleCampaignType === "SHOPPING" && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm font-bold text-slate-800">
                            Feed-driven product ads
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            Google Shopping creatives are sourced from the
                            linked Merchant Center product feed. Use this
                            workspace to prepare brand copy and visuals for
                            other formats; product title, image, price and
                            landing page remain feed-controlled.
                          </p>
                        </div>
                      )}
                      {googleCampaignType === "HOTEL" && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm font-bold text-slate-800">
                            Hotel Center listing ads
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            Hotel ads use eligible property, availability and
                            price data from Hotel Center. This is not a
                            social-post creative format, so a generic
                            image/video concept is not attached to the Hotel
                            listing.
                          </p>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                        <p className="text-[11px] text-slate-500">
                          This is a format preview and copy pack. Image crops,
                          file uploads and provider-side asset creation are not
                          simulated as completed.
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            attachCreativeToCampaign(googleVariation, "GOOGLE")
                          }
                          className="rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800"
                        >
                          {googleCampaignType === "SHOPPING" ||
                          googleCampaignType === "HOTEL" ||
                          (googleCampaignType === "DEMAND_GEN" &&
                            ["VIDEO_RESPONSIVE", "PRODUCT_FEED"].includes(
                              googleDemandGenFormat,
                            ))
                            ? "Save concept to Asset Library"
                            : "Apply Google Ads asset pack"}
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <p className="font-semibold text-slate-800">
                    Google Ads asset pack not generated yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Enter your brief and generate variations. The output preview
                    will follow the selected Google campaign type rather than a
                    Meta-style post.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold text-slate-900">
              Platform-specific creative rules
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-800">Google Ads</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Output changes by campaign type: Search gets a Responsive
                  Search Ad text pack; Performance Max gets an Asset Group;
                  Display gets responsive image/text assets; Demand Gen gets its
                  selected multi-asset, carousel, video or product-feed format;
                  App uses app asset sets; Shopping and Hotel remain
                  feed/listing-driven.
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-800">Meta Ads</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Meta gets placement-oriented creative previews such as Feed,
                  Stories, Reels and Carousel, with primary text, headline,
                  description and CTA. The same source idea is adapted
                  separately; it is not reused as a Google ad layout.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {workspaceView === "assets" && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Asset Library</h2>
            <p className="mt-1 text-sm text-slate-500">
              A shared library for visual media and Google text-asset packs.
              Each item exposes only the platform / campaign-type uses that make
              sense; assets are kept in page state and are not uploaded to
              Google or Meta.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="font-bold text-slate-900">Add an asset</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Asset Name *</label>
                <input
                  value={newAssetName}
                  onChange={(e) => {
                    setNewAssetName(e.target.value);
                    setAssetNotice("");
                  }}
                  className={inputClass}
                  placeholder="Summer campaign image"
                />
              </div>
              <div>
                <label className={labelClass}>Asset Type</label>
                <select
                  value={newAssetKind}
                  onChange={(e) => setNewAssetKind(e.target.value as AssetKind)}
                  className={inputClass}
                >
                  <option value="IMAGE">Image</option>
                  <option value="LOGO">Logo</option>
                  <option value="VIDEO">Video</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Asset URL *</label>
                <input
                  type="url"
                  value={newAssetUrl}
                  onChange={(e) => {
                    setNewAssetUrl(e.target.value);
                    setAssetNotice("");
                  }}
                  className={inputClass}
                  placeholder="https://.../asset.jpg"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={addAssetToLibrary}
              className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Add to library
            </button>
            {assetNotice && (
              <p className="mt-3 text-sm text-blue-700">{assetNotice}</p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold text-slate-900">
                Saved assets ({assetLibrary.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWorkspaceView("creative")}
                  className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
                >
                  Open Creative Studio
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceView("builder")}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Back to Builder
                </button>
              </div>
            </div>
            {assetLibrary.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center">
                <p className="font-semibold text-slate-700">
                  Your Asset Library is empty
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Add a URL above to start building your reusable media
                  collection.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {assetLibrary.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">
                          {asset.name}
                        </p>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                          {asset.kind}
                        </span>
                        {asset.origin === "AI_STUDIO" && (
                          <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-700">
                            AI Studio demo
                          </span>
                        )}
                        {attachedCreativeAssetIds.includes(asset.id) && (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                            Attached to draft
                          </span>
                        )}
                      </div>
                      {asset.kind === "TEXT" && asset.googlePack ? (
                        <p className="mt-1 text-xs text-slate-600">
                          Google {asset.googlePack.formatLabel} ·{" "}
                          {asset.googlePack.headlines.length} headlines ·{" "}
                          {asset.googlePack.descriptions.length} descriptions ·{" "}
                          {asset.googlePack.campaignType}
                        </p>
                      ) : (
                        <p className="mt-1 break-all text-xs text-slate-500">
                          {asset.url}
                        </p>
                      )}
                      {asset.aspectRatio && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Visual ratio: {asset.aspectRatio}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-slate-400">
                        Added {asset.addedAt}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {asset.kind === "IMAGE" &&
                        selectedPlatforms.includes("metaAds") && (
                          <button
                            type="button"
                            onClick={() => useLibraryAsset(asset, "meta")}
                            className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                          >
                            Use for Meta
                          </button>
                        )}
                      {asset.kind === "IMAGE" &&
                        selectedPlatforms.includes("googleAds") &&
                        googleCampaignType === "PERFORMANCE_MAX" && (
                          <>
                            {(!asset.aspectRatio ||
                              asset.aspectRatio === "1.91:1") && (
                              <button
                                type="button"
                                onClick={() =>
                                  useLibraryAsset(asset, "pmax-landscape")
                                }
                                className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                              >
                                Use as PMax landscape (1.91:1)
                                {!asset.aspectRatio ? " · verify crop" : ""}
                              </button>
                            )}
                            {(!asset.aspectRatio ||
                              asset.aspectRatio === "1:1") && (
                              <button
                                type="button"
                                onClick={() =>
                                  useLibraryAsset(asset, "pmax-square")
                                }
                                className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                              >
                                Use as PMax square (1:1)
                                {!asset.aspectRatio ? " · verify crop" : ""}
                              </button>
                            )}
                            {(!asset.aspectRatio ||
                              asset.aspectRatio === "4:5") && (
                              <button
                                type="button"
                                onClick={() =>
                                  useLibraryAsset(asset, "pmax-portrait")
                                }
                                className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                              >
                                Use as PMax portrait (4:5)
                                {!asset.aspectRatio ? " · verify crop" : ""}
                              </button>
                            )}
                          </>
                        )}
                      {asset.kind === "IMAGE" &&
                        selectedPlatforms.includes("googleAds") &&
                        ["DISPLAY", "DEMAND_GEN"].includes(
                          googleCampaignType,
                        ) &&
                        (!asset.aspectRatio ||
                          ["1.91:1", "16:9"].includes(asset.aspectRatio)) && (
                          <button
                            type="button"
                            onClick={() =>
                              useLibraryAsset(asset, "google-display")
                            }
                            className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                          >
                            Use for Google landscape image
                          </button>
                        )}
                      {asset.kind === "IMAGE" &&
                        selectedPlatforms.includes("googleAds") &&
                        ["DISPLAY", "DEMAND_GEN"].includes(
                          googleCampaignType,
                        ) &&
                        (!asset.aspectRatio || asset.aspectRatio === "1:1") && (
                          <button
                            type="button"
                            onClick={() =>
                              useLibraryAsset(asset, "google-display-square")
                            }
                            className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                          >
                            Use as Google square image
                          </button>
                        )}
                      {asset.kind === "IMAGE" &&
                        selectedPlatforms.includes("googleAds") &&
                        googleCampaignType === "DEMAND_GEN" && (
                          <button
                            type="button"
                            onClick={() => useLibraryAsset(asset, "demand-gen")}
                            className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                          >
                            Use in Demand Gen format
                          </button>
                        )}
                      {asset.kind === "IMAGE" &&
                        selectedPlatforms.includes("googleAds") &&
                        googleCampaignType === "APP" && (
                          <button
                            type="button"
                            onClick={() => useLibraryAsset(asset, "app-image")}
                            className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                          >
                            Use in App campaign
                          </button>
                        )}
                      {asset.kind === "TEXT" &&
                        asset.googlePack &&
                        selectedPlatforms.includes("googleAds") && (
                          <button
                            type="button"
                            onClick={() => useGoogleCopyAsset(asset)}
                            className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                          >
                            Use for Google {asset.googlePack.campaignType}
                          </button>
                        )}
                      {asset.kind === "IMAGE" &&
                        selectedPlatforms.includes("googleAds") &&
                        googleCampaignType === "SEARCH" && (
                          <span className="rounded-lg bg-slate-100 px-2.5 py-2 text-[11px] text-slate-600">
                            Search uses text assets; use a Google RSA copy pack
                          </span>
                        )}
                      {asset.kind === "VIDEO" &&
                        selectedPlatforms.includes("googleAds") &&
                        ["PERFORMANCE_MAX", "DEMAND_GEN", "APP"].includes(
                          googleCampaignType,
                        ) && (
                          <span className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                            Requires YouTube-hosted video ID
                          </span>
                        )}
                      {["IMAGE", "LOGO"].includes(asset.kind) &&
                        selectedPlatforms.includes("googleAds") &&
                        googleCampaignType === "PERFORMANCE_MAX" && (
                          <button
                            type="button"
                            onClick={() => useLibraryAsset(asset, "pmax-logo")}
                            className="rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700"
                          >
                            Use as PMax logo (1:1)
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => deleteLibraryAsset(asset.id)}
                        className="rounded-lg border border-red-200 px-2.5 py-2 text-xs font-semibold text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
            Prototype limitation: this library stores URL references in React
            state only. Real uploads, file validation, thumbnails, storage,
            provider-specific asset uploads and permissions will be implemented
            with the backend and object storage.
          </p>
        </section>
      )}

      {workspaceView === "campaigns" && (
        <section className="mt-8 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">Workspace</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                Campaign Management
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                View and manage Google Ads, Meta Ads and cross-platform campaign
                drafts from one workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setWorkspaceView("builder");
                setStep(1);
                setError("");
                clearPreview();
              }}
              className="w-fit shrink-0 whitespace-nowrap rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              + Create campaign
            </button>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <strong>Prototype workspace:</strong> sample records are clearly
            marked. Search, filters, pause/resume, duplicate and archive actions
            update local page state only; no live Google Ads or Meta Ads
            campaign is changed.
          </div>

          {campaignNotice && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <span>{campaignNotice}</span>
              <button
                type="button"
                onClick={() => setCampaignNotice("")}
                className="text-xs font-semibold underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              {
                label: "Total campaigns",
                value: campaignMetrics.total,
                tone: "text-slate-900",
              },
              {
                label: "Active",
                value: campaignMetrics.active,
                tone: "text-emerald-700",
              },
              {
                label: "Paused",
                value: campaignMetrics.paused,
                tone: "text-amber-700",
              },
              {
                label: "Drafts",
                value: campaignMetrics.drafts,
                tone: "text-blue-700",
              },
              {
                label: "Needs attention",
                value: campaignMetrics.attention,
                tone: "text-red-700",
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <p className="text-xs font-medium text-slate-500">
                  {metric.label}
                </p>
                <p className={`mt-2 text-2xl font-bold ${metric.tone}`}>
                  {metric.value}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor="campaign-management-search">
                  Search campaigns
                </label>
                <input
                  id="campaign-management-search"
                  value={campaignSearch}
                  onChange={(event) => setCampaignSearch(event.target.value)}
                  placeholder="Search campaign, ID, type or account..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <select
                value={campaignPlatformFilter}
                onChange={(event) =>
                  setCampaignPlatformFilter(
                    event.target.value as CampaignPlatformFilter,
                  )
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                aria-label="Filter by platform"
              >
                <option value="ALL">All platforms</option>
                <option value="GOOGLE">Google Ads</option>
                <option value="META">Meta Ads</option>
                <option value="BOTH">Both platforms</option>
              </select>
              <select
                value={campaignStatusFilter}
                onChange={(event) =>
                  setCampaignStatusFilter(
                    event.target.value as CampaignLifecycleStatus | "ALL",
                  )
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                aria-label="Filter by status"
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="DRAFT">Draft</option>
                <option value="FAILED">Failed</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>

            {filteredCampaignRecords.length === 0 ? (
              <div className="p-10 text-center">
                <p className="font-semibold text-slate-800">
                  No campaigns match these filters
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Change the search or filters to see more campaigns.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCampaignSearch("");
                    setCampaignPlatformFilter("ALL");
                    setCampaignStatusFilter("ALL");
                  }}
                  className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(230px,1.7fr)_minmax(125px,0.9fr)_minmax(130px,1fr)_minmax(130px,1fr)_110px_150px] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 xl:grid">
                  <span>Campaign</span>
                  <span>Platform</span>
                  <span>Type / objective</span>
                  <span>Budget</span>
                  <span>Status</span>
                  <span>Last updated</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredCampaignRecords.map((record) => {
                    const statusStyle =
                      record.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-700"
                        : record.status === "PAUSED"
                          ? "bg-amber-50 text-amber-700"
                          : record.status === "FAILED"
                            ? "bg-red-50 text-red-700"
                            : record.status === "ARCHIVED"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-blue-50 text-blue-700";
                    const providerLabel =
                      record.provider === "googleAds"
                        ? "Google Ads"
                        : record.provider === "metaAds"
                          ? "Meta Ads"
                          : "Google + Meta";
                    return (
                      <div
                        key={record.id}
                        className="p-4 transition hover:bg-slate-50/70"
                      >
                        <div className="grid gap-3 xl:grid-cols-[minmax(230px,1.7fr)_minmax(125px,0.9fr)_minmax(130px,1fr)_minmax(130px,1fr)_110px_150px] xl:items-center">
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCampaignId(record.id);
                                setWorkspaceView("campaign");
                              }}
                              className="text-left text-sm font-bold text-slate-900 hover:text-blue-700"
                            >
                              {record.name}
                            </button>
                            <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
                              {record.id}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${record.source === "SAMPLE" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}
                              >
                                {record.source === "SAMPLE"
                                  ? "SAMPLE DATA"
                                  : "LOCAL RECORD"}
                              </span>
                              {record.creationStatus === "PARTIAL_SUCCESS" && (
                                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                                  PARTIAL SETUP
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-sm text-slate-700">
                            {providerLabel}
                            <p className="mt-1 text-[10px] text-slate-400">
                              {record.accountLabel}
                            </p>
                          </div>
                          <div className="text-sm text-slate-700">
                            {record.campaignType}
                            <p className="mt-1 text-[10px] text-slate-400">
                              {objectives.find(
                                (item) => item.value === record.objective,
                              )?.label ?? record.objective}
                            </p>
                          </div>
                          <div className="text-sm text-slate-700">
                            {record.budgetLabel}
                          </div>
                          <div>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyle}`}
                            >
                              {record.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            {record.updatedAt}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCampaignId(record.id);
                              setWorkspaceView("campaign");
                            }}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
                          >
                            View details
                          </button>
                          <button
                            type="button"
                            onClick={() => editCampaignRecord(record)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Edit brief
                          </button>
                          <button
                            type="button"
                            disabled={
                              record.status !== "ACTIVE" &&
                              record.status !== "PAUSED"
                            }
                            onClick={() => toggleCampaignLifecycle(record)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {record.status === "ACTIVE" ? "Pause" : "Resume"}
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateCampaignRecord(record)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Duplicate
                          </button>
                          {record.status !== "ARCHIVED" && (
                            <button
                              type="button"
                              onClick={() => archiveCampaignRecord(record)}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
              Showing {filteredCampaignRecords.length} of{" "}
              {campaignRecords.length} local campaign records. Provider sync and
              live performance metrics are not connected in this prototype.
            </div>
          </div>
        </section>
      )}

      {workspaceView === "campaign" && (
        <section className="mt-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                Campaign Details
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Review the unified campaign job and its separate provider
                resource results.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setWorkspaceView("campaigns")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Back to Campaign Management
              </button>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceView("builder");
                  setStep(5);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Open Campaign Builder
              </button>
            </div>
          </div>
          {selectedCampaign && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                      {selectedCampaign.provider === "googleAds"
                        ? "GOOGLE ADS"
                        : selectedCampaign.provider === "metaAds"
                          ? "META ADS"
                          : "GOOGLE + META"}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                      {selectedCampaign.source === "SAMPLE"
                        ? "SAMPLE DATA"
                        : "LOCAL RECORD"}
                    </span>
                  </div>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">
                    {selectedCampaign.name}
                  </h3>
                  <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
                    {selectedCampaign.id}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {selectedCampaign.campaignType} ·{" "}
                    {objectives.find(
                      (item) => item.value === selectedCampaign.objective,
                    )?.label ?? selectedCampaign.objective}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${selectedCampaign.status === "ACTIVE" ? "bg-green-100 text-green-800" : selectedCampaign.status === "FAILED" ? "bg-red-100 text-red-800" : selectedCampaign.status === "PAUSED" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}
                >
                  {selectedCampaign.status}
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">
                    Budget
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {selectedCampaign.budgetLabel}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">
                    Ad account
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {selectedCampaign.accountLabel}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">
                    Created
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {selectedCampaign.createdAt}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">
                    Creation result
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {selectedCampaign.creationStatus.replace("_", " ")}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => editCampaignRecord(selectedCampaign)}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Edit brief
                </button>
                <button
                  type="button"
                  onClick={() => duplicateCampaignRecord(selectedCampaign)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  Duplicate as draft
                </button>
                {(selectedCampaign.status === "ACTIVE" ||
                  selectedCampaign.status === "PAUSED") && (
                  <button
                    type="button"
                    onClick={() => toggleCampaignLifecycle(selectedCampaign)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    {selectedCampaign.status === "ACTIVE"
                      ? "Pause campaign"
                      : "Resume campaign"}
                  </button>
                )}
              </div>
              {selectedCampaign.jobId && (
                <p className="mt-4 text-xs text-slate-500">
                  Execution job:{" "}
                  <span className="font-mono">{selectedCampaign.jobId}</span>
                </p>
              )}
            </div>
          )}
          {savedDraft && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-blue-700">
                    DRAFT · NOT SENT TO PROVIDERS
                  </span>
                  <h3 className="mt-2 font-bold text-slate-900">
                    {savedDraft.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Saved locally in this prototype · {savedDraft.savedAt}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resumeSavedDraft}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Resume setup
                </button>
              </div>
            </div>
          )}
          {!selectedCampaign && !demoJob && !savedDraft ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="font-semibold text-slate-800">
                No prototype campaign result yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Prepare a campaign request and run a mock creation scenario to
                populate this page.
              </p>
              <button
                type="button"
                onClick={() => setWorkspaceView("builder")}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Go to Builder
              </button>
            </div>
          ) : null}
          {selectedCampaign &&
            (!selectedCampaign.jobId ||
              selectedCampaign.jobId !== demoJob?.jobId) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                This record has no linked execution job. Sample rows are
                illustrative data; draft and duplicated rows are stored only in
                this page state. Provider campaign details, delivery metrics and
                account synchronization will be supplied by the Google Ads and
                Meta Ads adapters in the production phase.
              </div>
            )}
          {demoJob && selectedCampaign?.jobId === demoJob.jobId && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    {demoJob.jobId}
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">
                    {campaignName || "Unified campaign"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {businessName} · {selectedObjective?.label || objective} ·{" "}
                    {demoJob.createdAt}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${demoJob.overallStatus === "SUCCESS" ? "bg-green-100 text-green-800" : demoJob.overallStatus === "FAILED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
                >
                  {demoJob.overallStatus.replace("_", " ")}
                </span>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {demoJob.providers.map((provider) => (
                  <div
                    key={provider.provider}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <h4 className="font-bold text-slate-900">
                      {provider.provider === "googleAds"
                        ? "Google Ads"
                        : "Meta Ads"}
                    </h4>
                    <div className="mt-3 space-y-3">
                      {provider.resources.map((resource) => (
                        <div
                          key={resource.key}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="text-slate-600">
                            {resource.label}
                          </span>
                          <span
                            className={`text-xs font-semibold ${resource.status === "SUCCESS" ? "text-green-700" : resource.status === "FAILED" ? "text-red-700" : "text-slate-400"}`}
                          >
                            {resource.status.replace("_", " ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWorkspaceView("ads")}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Open Ad Management
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceView("assets")}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                >
                  Open Asset Library
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {workspaceView === "ads" && (
        <section className="mt-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                Ad Management
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Manage ad-level mock resources independently of the campaign
                creation wizard.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setWorkspaceView("builder");
                setStep(4);
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Create / Edit Ad Draft
            </button>
          </div>
          {!demoJob ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="font-semibold text-slate-800">
                No ads to manage yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Run a mock campaign creation scenario first. The results will
                appear here with pause and duplicate actions.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-5">
                <h3 className="font-bold text-slate-900">
                  {campaignName || "Unified campaign"}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Demo job {demoJob.jobId} · These actions only update local
                  prototype state.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {demoJob.providers
                  .flatMap((provider) =>
                    provider.resources
                      .filter((resource) =>
                        [
                          "Ad",
                          "Ad Creative",
                          "Responsive Search Ad",
                          "Responsive Display Ad",
                          "Demand Gen Ad",
                          "Asset links",
                          "Product listing",
                          "Hotel Listing Group",
                          "App assets",
                        ].includes(resource.label),
                      )
                      .map((resource) => ({
                        provider: provider.provider,
                        resource,
                      })),
                  )
                  .map(({ provider, resource }) => {
                    const stateKey = `${provider}-${resource.key}`;
                    const currentStatus = managedStatuses[stateKey] || "PAUSED";
                    return (
                      <div
                        key={stateKey}
                        className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">
                              {resource.label}
                            </p>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                              {provider === "googleAds"
                                ? "GOOGLE ADS"
                                : "META ADS"}
                            </span>
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-bold ${resource.status === "SUCCESS" ? "bg-green-100 text-green-700" : resource.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}
                            >
                              {resource.status}
                            </span>
                          </div>
                          {resource.resourceId && (
                            <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                              {resource.resourceId}
                            </p>
                          )}
                          {resource.errorMessage && (
                            <p className="mt-1 text-xs text-red-700">
                              {resource.errorMessage}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-slate-500">
                            Local ad control: {currentStatus}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={resource.status !== "SUCCESS"}
                            onClick={() => toggleManagedStatus(stateKey)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {currentStatus === "ACTIVE" ? "Pause" : "Activate"}
                          </button>
                          <button
                            type="button"
                            disabled={resource.status !== "SUCCESS"}
                            onClick={() =>
                              duplicateManagedDraft(resource.label, stateKey)
                            }
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Duplicate draft
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setWorkspaceView("builder");
                              setStep(4);
                              setError("");
                              clearPreview();
                            }}
                            className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700"
                          >
                            Edit draft
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
              {duplicatedDrafts.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50 p-5">
                  <h4 className="text-sm font-bold text-slate-800">
                    Duplicated local drafts ({duplicatedDrafts.length})
                  </h4>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {duplicatedDrafts.map((draft, index) => (
                      <li key={`${draft}-${index}`}>{draft}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
            Pause, activate and duplicate actions are visual simulations only.
            In production, each action must call the correct provider resource
            endpoint and reflect the provider's returned status.
          </p>
        </section>
      )}

      {workspaceView === "builder" && (
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
          {step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ← Back
            </button>
          ) : (
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
          )}
          {step >= 3 && step < 5 && (
            <button
              type="button"
              onClick={saveCurrentDraft}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Save draft & finish later
            </button>
          )}
          {step < 5 && (
            <button
              type="button"
              onClick={goNext}
              disabled={loadingConnections || Boolean(connectionError)}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
