import { getProviderAccessToken } from "../../utils/provider-token.utils.js";

export interface MetaAdsCreationContext {
  adAccountId: string;
  accessToken: string;
  apiVersion: string;
}


export interface MetaAudienceReference {
  id: string;
  name?: string;
}

export interface MetaAudienceTargeting {
  custom_audiences?: MetaAudienceReference[];
  excluded_custom_audiences?: MetaAudienceReference[];
}
export type MetaAdsBidStrategy =
  | "LOWEST_COST_WITHOUT_CAP"
  | "LOWEST_COST_WITH_BID_CAP"
  | "COST_CAP"
  | "LOWEST_COST_WITH_MIN_ROAS";


export interface CreateMetaAdsCampaignInput {
  name: string;
  objective: MetaAdsCampaignObjective;

  specialAdCategories?: string[];
  buyingType?: "AUCTION" | "RESERVED";

  isAdsetBudgetSharingEnabled?: boolean;

  validateOnly?: boolean;
  confirm?: boolean;

  // Campaign-level budget settings
  budgetLevel?: "CAMPAIGN" | "AD_SET";
  dailyBudgetAmount?: number;
  lifetimeBudgetAmount?: number;
  budgetCurrency?: string;

  // Campaign-level bidding
  bidStrategy?: MetaAdsBidStrategy;

  // Campaign schedule
  startTime?: string;
  stopTime?: string;
}

interface ValidatedMetaAdsCampaignInput {
  name: string;
  objective: MetaAdsCampaignObjective;
  specialAdCategories: string[];
  buyingType: "AUCTION" | "RESERVED";
  validateOnly: boolean;
  confirm?: boolean;

  budgetLevel: "CAMPAIGN" | "AD_SET";
  dailyBudgetMinorUnits?: string;
  lifetimeBudgetMinorUnits?: string;
  bidStrategy?: MetaAdsBidStrategy;

  isAdsetBudgetSharingEnabled?: boolean;
  startTime?: string;
  stopTime?: string;
}
const META_OPTIMIZATION_GOALS_BY_OBJECTIVE: Record<
  MetaAdsCampaignObjective,
  readonly string[]
> = {
  OUTCOME_AWARENESS: [
    "REACH",
    "IMPRESSIONS",
    "AD_RECALL_LIFT",
  ],

  OUTCOME_TRAFFIC: [
    "LINK_CLICKS",
    "LANDING_PAGE_VIEWS",
  ],

  OUTCOME_ENGAGEMENT: [
    "POST_ENGAGEMENT",
    "PAGE_LIKES",
    "CONVERSATIONS",
  ],

  OUTCOME_LEADS: [
    "LEAD_GENERATION",
    "OFFSITE_CONVERSIONS",
  ],

  OUTCOME_SALES: [
    "OFFSITE_CONVERSIONS",
    "VALUE",
  ],

  OUTCOME_APP_PROMOTION: [
    "APP_INSTALLS",
    "OFFSITE_CONVERSIONS",
  ],
};
export interface CreateMetaAdsAdInput {
  name: string;
  adSetId: string;
  creativeId: string;

  validateOnly?: boolean;
  confirm?: boolean;

}

export interface MetaAdsAdCreationResult {
  validateOnly: boolean;
  adAccountId: string;
  adId: string | null;
  adSetId: string | null;
  creativeId: string | null;
  name: string;
  status: "PAUSED";
  metaResponse: Record<string, unknown> | null;
}
export type MetaAdsCallToAction =
  | "LEARN_MORE"
  | "SHOP_NOW"
  | "SIGN_UP"
  | "CONTACT_US"
  | "GET_QUOTE"
  | "DOWNLOAD";

export interface CreateMetaAdsAdCreativeInput {
  name: string;
  pageId: string;
  instagramActorId?: string;

  primaryText: string;
  headline: string;
  description?: string;

  imageUrl: string;
  destinationUrl: string;
  callToAction: MetaAdsCallToAction;

  validateOnly?: boolean;
  confirm?: boolean;
}

export interface MetaAdsAdCreativeCreationResult {
  validateOnly: boolean;
  adAccountId: string;
  creativeId: string | null;
  name: string;
  pageId: string;
  metaResponse: Record<string, unknown> | null;
}
export interface MetaAdsCampaignCreationResult {
  validateOnly: boolean;
  adAccountId: string;
  campaignId: string | null;
  name: string;
  objective: MetaAdsCampaignObjective;
  status: "PAUSED";
  buyingType: "AUCTION" | "RESERVED";
  metaResponse: Record<string, unknown> | null;
}

interface MetaApiErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
  [key: string]: unknown;
}

export class MetaAdsCampaignCreationError extends Error {
  constructor(
    message: string,
    public statusCode = 500,
    public details?: unknown,
  ) {
    super(message);
    this.name = "MetaAdsCampaignCreationError";
  }
}

function toMetaMinorCurrencyUnits(amount: number, currency: string): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new MetaAdsCampaignCreationError(
      "Amount must be a positive number.",
      400,
    );
  }

  const normalizedCurrency = currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new MetaAdsCampaignCreationError(
      "A valid three-letter account currency is required.",
      400,
    );
  }

  let fractionDigits: any;

  try {
    fractionDigits = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw new MetaAdsCampaignCreationError("Unsupported budget currency.", 400);
  }

  const minorUnits = Math.round(
    (amount + Number.EPSILON) * 10 ** fractionDigits,
  );

  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0) {
    throw new MetaAdsCampaignCreationError(
      "Amount is outside the supported range.",
      400,
    );
  }

  return String(minorUnits);
}

export type MetaLocationType = "home" | "recent" | "travel_in";

export type MetaDistanceUnit = "mile" | "kilometer";

export interface MetaGeoLocationKey {
  key: string;
}

export interface MetaGeoLocationCity {
  key: string;
  radius?: number;
  distance_unit?: MetaDistanceUnit;
}

export interface MetaGeoCustomLocation {
  latitude: number;
  longitude: number;
  radius: number;
  distance_unit: MetaDistanceUnit;
  address_string?: string;
  country?: string;
  region_id?: number;
  primary_city_id?: number;
}

export interface MetaGeoLocations {
  countries?: string[];
  country_groups?: string[];
  regions?: MetaGeoLocationKey[];
  cities?: MetaGeoLocationCity[];
  zips?: MetaGeoLocationKey[];
  custom_locations?: MetaGeoCustomLocation[];
  location_types?: MetaLocationType[];
}

export type MetaExcludedGeoLocations = Omit<MetaGeoLocations, "location_types">;


const META_BILLING_EVENTS_BY_GOAL: Record<
  string,
  readonly string[]
> = {
  LINK_CLICKS: [
    "LINK_CLICKS",
    "IMPRESSIONS",
  ],

  LANDING_PAGE_VIEWS: [
    "IMPRESSIONS",
  ],

  APP_INSTALLS: [
    "APP_INSTALLS",
    "IMPRESSIONS",
  ],

  POST_ENGAGEMENT: [
    "POST_ENGAGEMENT",
    "IMPRESSIONS",
  ],

  PAGE_LIKES: [
    "PAGE_LIKES",
    "IMPRESSIONS",
  ],

  DEFAULT: [
    "IMPRESSIONS",
  ],
};
const META_REQUIRED_DESTINATION_BY_GOAL: Partial<
  Record<string, MetaAdsDestinationType>
> = {
  LINK_CLICKS: "WEBSITE",
  LANDING_PAGE_VIEWS: "WEBSITE",

  POST_ENGAGEMENT: "ON_POST",
  PAGE_LIKES: "ON_PAGE",
  LEAD_GENERATION: "ON_AD",

  APP_INSTALLS: "APP_STORE",
};


export interface CreateMetaAdsCampaignBundleInput {
  campaign: CreateMetaAdsCampaignInput;

  adSet: Omit<
    CreateMetaAdsAdSetInput,
    "campaignId" | "validateOnly" | "confirm"
  >;

  creative: Omit<
    CreateMetaAdsAdCreativeInput,
    "validateOnly" | "confirm"
  >;

  ad: Omit<
    CreateMetaAdsAdInput,
    "adSetId" | "creativeId" | "validateOnly" | "confirm"
  >;
}

export interface MetaAdsCampaignBundleCreationResult {
  validateOnly: boolean;
  adAccountId: string;

  campaign: MetaAdsCampaignCreationResult;
  adSet: MetaAdsAdSetCreationResult;
  creative: MetaAdsAdCreativeCreationResult;
  ad: MetaAdsAdCreationResult;
}


export interface MetaAdsTargeting {
  geo_locations: MetaGeoLocations;
  excluded_geo_locations?: MetaExcludedGeoLocations;

  age_min?: number;
  age_max?: number;
  genders?: number[];

  [key: string]: unknown;
  custom_audiences?: MetaAudienceReference[];

  excluded_custom_audiences?: MetaAudienceReference[];

  // Advantage+ audience age suggestion.
  // This is a suggestion, not the same as hard age limits.
  age_range?: [number, number];

  // Language targeting.
  // Values are Meta locale IDs returned by targeting search.
  locales?: number[];

  // Optional demographic targeting.
  education_statuses?: number[];
  relationship_statuses?: number[];
  college_years?: number[];
  flexible_spec?: MetaFlexibleTargetingGroup[];
}


export interface MetaAdsAdSetCreationResult {
  validateOnly: boolean;
  adAccountId: string | null;
  campaignId: string | null;
  adSetId: string | null;
  name: string;
  status: "PAUSED";
  metaResponse: Record<string, unknown> | null;
}

export interface CreateMetaAdsAdSetInput {
  campaignId: string;
  name: string;
  advantageAudience?: MetaAdvantageAudienceSettings;
  specialAdCategories?: string[];
  optimization_goal: string;
  billing_event: string;
  targeting: MetaAdsTargeting;
  placements?: MetaAdsPlacementSettings;
  dailyBudgetAmount?: number;
  budgetCurrency?: string;
  campaignObjective: MetaAdsCampaignObjective;

  destinationType?: MetaAdsDestinationType;

  promoted_object?: MetaAdsPromotedObject;

  // Budget ownership
  budgetLevel?: "CAMPAIGN" | "AD_SET";

  // Lifetime budget (major currency units)
  lifetimeBudgetAmount?: number;

  // Schedule
  startTime?: string;
  endTime?: string;

  // Attribution
  attributionSpec?: MetaAdsAttributionSpec[];

  // Optional destination
  // destinationType?: string;
  bid_strategy?: MetaAdsBidStrategy;
  bidAmountInput?: number;

  bid_constraints?: {
    roas_average_floor: number;
  };



  validateOnly?: boolean;
  confirm?: boolean;
}

export interface MetaTargetingOption {
  id: string;
  name: string;
}

export interface MetaFlexibleTargetingGroup {
  interests?: MetaTargetingOption[];
  behaviors?: MetaTargetingOption[];
  demographics?: MetaTargetingOption[];
  life_events?: MetaTargetingOption[];
  industries?: MetaTargetingOption[];
  family_statuses?: MetaTargetingOption[];
  income?: MetaTargetingOption[];
}
function normalizeMetaSchedule(
  startTime?: string,
  endTime?: string,
  lifetimeBudget = false,
) {
  const parseDate = (
    value: string | undefined,
    fieldName: string,
  ): string | undefined => {
    if (value === undefined) return undefined;

    const date = new Date(value);

    if (
      Number.isNaN(date.getTime()) ||
      !/^\d{4}-\d{2}-\d{2}T/.test(value)
    ) {
      throw new MetaAdsCampaignCreationError(
        `${fieldName} must be a valid ISO 8601 datetime.`,
        400,
      );
    }

    return date.toISOString();
  };

  const normalizedStart = parseDate(
    startTime,
    "startTime",
  );

  const normalizedEnd = parseDate(
    endTime,
    "endTime",
  );

  if (
    normalizedStart &&
    normalizedEnd &&
    new Date(normalizedEnd).getTime() <=
    new Date(normalizedStart).getTime()
  ) {
    throw new MetaAdsCampaignCreationError(
      "endTime must be later than startTime.",
      400,
    );
  }

  if (lifetimeBudget && !normalizedEnd) {
    throw new MetaAdsCampaignCreationError(
      "An endTime is required when using a lifetime budget.",
      400,
    );
  }

  return {
    startTime: normalizedStart,
    endTime: normalizedEnd,
  };
}
function normalizeMetaAttributionSpec(
  value?: MetaAdsAttributionSpec[],
): MetaAdsAttributionSpec[] | undefined {
  if (value === undefined) return undefined;

  if (!Array.isArray(value) || value.length === 0) {
    throw new MetaAdsCampaignCreationError(
      "attributionSpec must contain at least one attribution window.",
      400,
    );
  }

  const allowedEvents = [
    "CLICK_THROUGH",
    "VIEW_THROUGH",
    "ENGAGED_VIEW",
  ];

  const seen = new Set<string>();

  return value.map((item) => {
    if (
      !item ||
      !allowedEvents.includes(item.event_type) ||
      !Number.isInteger(item.window_days) ||
      item.window_days < 1 ||
      item.window_days > 28
    ) {
      throw new MetaAdsCampaignCreationError(
        "Invalid attribution specification.",
        400,
      );
    }

    const key = `${item.event_type}:${item.window_days}`;

    if (seen.has(key)) {
      throw new MetaAdsCampaignCreationError(
        "Duplicate attribution windows are not allowed.",
        400,
      );
    }

    seen.add(key);

    return {
      event_type: item.event_type,
      window_days: item.window_days,
    };
  });
}
function normalizeMetaAudienceReferences(
  value: MetaAudienceReference[] | undefined,
  fieldName: string,
): Array<{ id: string }> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    !Array.isArray(value) ||
    value.length > 500
  ) {
    throw new MetaAdsCampaignCreationError(
      `${fieldName} must be an array containing at most 500 audience IDs.`,
      400,
    );
  }

  const normalized = value.map((audience) => {
    const id = audience?.id?.trim();

    if (!id || !/^\d+$/.test(id)) {
      throw new MetaAdsCampaignCreationError(
        `${fieldName} contains an invalid Meta audience ID.`,
        400,
      );
    }

    return { id };
  });

  return [
    ...new Map(
      normalized.map((audience) => [
        audience.id,
        audience,
      ]),
    ).values(),
  ];
}
const META_PLACEMENT_OPTIONS = {
  publisherPlatforms: [
    "facebook",
    "instagram",
    "audience_network",
    "messenger",
    "threads",
    "whatsapp",
  ],

  facebookPositions: [
    "feed",
    "right_hand_column",
    "marketplace",
    "video_feeds",
    "story",
    "search",
    "instream_video",
    "facebook_reels",
    "facebook_reels_overlay",
    "profile_feed",
    "notification",
  ],

  instagramPositions: [
    "stream",
    "story",
    "explore",
    "explore_home",
    "reels",
    "profile_feed",
    "ig_search",
    "profile_reels",
  ],

  audienceNetworkPositions: [
    "classic",
    "rewarded_video",
  ],

  messengerPositions: [
    "messenger_home",
    "sponsored_messages",
    "story",
  ],

  threadsPositions: [
    "threads_stream",
  ],

  whatsappPositions: [
    "status",
  ],

  devicePlatforms: [
    "mobile",
    "desktop",
  ],
} as const;

function normalizeMetaPlacementSettings(
  input?: MetaAdsPlacementSettings,
): Record<string, unknown> {
  if (!input || input.mode === "AUTOMATIC") {
    if (
      input &&
      [
        input.publisherPlatforms,
        input.facebookPositions,
        input.instagramPositions,
        input.audienceNetworkPositions,
        input.messengerPositions,
        input.threadsPositions,
        input.whatsappPositions,
      ].some((value) => value !== undefined)
    ) {
      throw new MetaAdsCampaignCreationError(
        "Manual placement fields cannot be provided in AUTOMATIC mode.",
        400,
      );
    }

    return {};
  }

  if (input.mode !== "MANUAL") {
    throw new MetaAdsCampaignCreationError(
      "Placement mode must be AUTOMATIC or MANUAL.",
      400,
    );
  }

  const publisherPlatforms = input.publisherPlatforms;

  if (
    !Array.isArray(publisherPlatforms) ||
    publisherPlatforms.length === 0 ||
    publisherPlatforms.some(
      (platform) =>
        !(META_PLACEMENT_OPTIONS.publisherPlatforms as readonly string[])
          .includes(platform),
    )
  ) {
    throw new MetaAdsCampaignCreationError(
      "Manual placements require at least one supported publisher platform.",
      400,
    );
  }

  const selectedPlatforms = new Set(publisherPlatforms);

  const result: Record<string, unknown> = {
    publisher_platforms: [...selectedPlatforms],
  };

  const positionMappings = [
    {
      input: input.facebookPositions,
      output: "facebook_positions",
      platform: "facebook",
      allowed: META_PLACEMENT_OPTIONS.facebookPositions,
    },
    {
      input: input.instagramPositions,
      output: "instagram_positions",
      platform: "instagram",
      allowed: META_PLACEMENT_OPTIONS.instagramPositions,
    },
    {
      input: input.audienceNetworkPositions,
      output: "audience_network_positions",
      platform: "audience_network",
      allowed: META_PLACEMENT_OPTIONS.audienceNetworkPositions,
    },
    {
      input: input.messengerPositions,
      output: "messenger_positions",
      platform: "messenger",
      allowed: META_PLACEMENT_OPTIONS.messengerPositions,
    },
    {
      input: input.threadsPositions,
      output: "threads_positions",
      platform: "threads",
      allowed: META_PLACEMENT_OPTIONS.threadsPositions,
    },
    {
      input: input.whatsappPositions,
      output: "whatsapp_positions",
      platform: "whatsapp",
      allowed: META_PLACEMENT_OPTIONS.whatsappPositions,
    },
  ] as const;

  for (const mapping of positionMappings) {
    if (mapping.input === undefined) {
      continue;
    }

    if (!selectedPlatforms.has(mapping.platform)) {
      throw new MetaAdsCampaignCreationError(
        `${mapping.output} requires ${mapping.platform} in publisherPlatforms.`,
        400,
      );
    }

    if (
      !Array.isArray(mapping.input) ||
      mapping.input.length === 0 ||
      mapping.input.some(
        (position) =>
          !(mapping.allowed as readonly string[]).includes(position),
      )
    ) {
      throw new MetaAdsCampaignCreationError(
        `Invalid ${mapping.output} selection.`,
        400,
      );
    }

    result[mapping.output] = [...new Set(mapping.input)];
  }

  if (input.devicePlatforms !== undefined) {
    if (
      !Array.isArray(input.devicePlatforms) ||
      input.devicePlatforms.length === 0 ||
      input.devicePlatforms.some(
        (device) =>
          !META_PLACEMENT_OPTIONS.devicePlatforms.includes(
            device as "mobile" | "desktop",
          ),
      )
    ) {
      throw new MetaAdsCampaignCreationError(
        "devicePlatforms must contain mobile and/or desktop.",
        400,
      );
    }

    result[`device_platforms`] = [
      ...new Set(input.devicePlatforms),
    ];
  }

  if (
    input.deviceExpansion !== undefined &&
    typeof input.deviceExpansion !== "boolean"
  ) {
    throw new MetaAdsCampaignCreationError(
      "deviceExpansion must be a boolean.",
      400,
    );
  }

  if (
    input.deviceExpansion !== undefined &&
    input.devicePlatforms === undefined
  ) {
    throw new MetaAdsCampaignCreationError(
      "deviceExpansion requires explicit devicePlatforms.",
      400,
    );
  }

  return result;
}

function normalizeAdAccountId(value: string): string {
  const normalized = value.trim();
  const accountId = normalized.startsWith("act_")
    ? normalized
    : `act_${normalized}`;

  if (!/^act_\d+$/.test(accountId)) {
    throw new MetaAdsCampaignCreationError(
      "Invalid Meta Ads account ID. Expected a numeric ID or act_{accountId}.",
      400,
    );
  }

  return accountId;
}

function getMetaApiVersion(): string {
  const version = process.env.META_ADS_API_VERSION?.trim() || "v27.0";

  if (!/^v\d+\.\d+$/.test(version)) {
    throw new MetaAdsCampaignCreationError(
      "Invalid META_ADS_API_VERSION. Expected a version such as v27.0.",
      500,
    );
  }

  return version;
}

function validateCreateCampaignInput(
  input: CreateMetaAdsCampaignInput,
): ValidatedMetaAdsCampaignInput {
  // 1. Campaign name
  const name = input.name?.trim();

  if (!name || name.length > 255 || /[\0\r\n]/.test(name)) {
    throw new MetaAdsCampaignCreationError(
      "Campaign name is required and must not exceed 255 characters.",
      400,
    );
  }

  // 2. Campaign objective
  const objective = String(input.objective ?? "")
    .trim()
    .toUpperCase() as MetaAdsCampaignObjective;

  const supportedObjectives: MetaAdsCampaignObjective[] = [
    "OUTCOME_AWARENESS",
    "OUTCOME_TRAFFIC",
    "OUTCOME_ENGAGEMENT",
    "OUTCOME_LEADS",
    "OUTCOME_SALES",
    "OUTCOME_APP_PROMOTION",
  ];

  if (!supportedObjectives.includes(objective)) {
    throw new MetaAdsCampaignCreationError(
      "Unsupported Meta campaign objective.",
      400,
    );
  }

  // 3. Special Ad Categories
  const categories = input.specialAdCategories ?? [];

  if (
    !Array.isArray(categories) ||
    !categories.every(
      (category) =>
        typeof category === "string" &&
        category.trim().length > 0 &&
        category.trim().length <= 80,
    )
  ) {
    throw new MetaAdsCampaignCreationError(
      "specialAdCategories must be an array of valid category strings.",
      400,
    );
  }

  const specialAdCategories = categories.map((category) =>
    category.trim().toUpperCase(),
  );

  if (
    new Set(specialAdCategories).size !==
    specialAdCategories.length
  ) {
    throw new MetaAdsCampaignCreationError(
      "Duplicate special ad categories are not allowed.",
      400,
    );
  }

  // 4. Buying type
  const buyingType = input.buyingType ?? "AUCTION";

  if (buyingType !== "AUCTION" && buyingType !== "RESERVED") {
    throw new MetaAdsCampaignCreationError(
      "buyingType must be AUCTION or RESERVED.",
      400,
    );
  }

  // 5. Ad Set budget-sharing setting
  if (
    input.isAdsetBudgetSharingEnabled !== undefined &&
    typeof input.isAdsetBudgetSharingEnabled !== "boolean"
  ) {
    throw new MetaAdsCampaignCreationError(
      "isAdsetBudgetSharingEnabled must be a boolean.",
      400,
    );
  }

  // 6. Mutation mode
  const validateOnly = input.validateOnly ?? true;

  if (typeof validateOnly !== "boolean") {
    throw new MetaAdsCampaignCreationError(
      "validateOnly must be a boolean.",
      400,
    );
  }

  if (!validateOnly && input.confirm !== true) {
    throw new MetaAdsCampaignCreationError(
      "Live Campaign creation requires validateOnly: false and confirm: true.",
      400,
    );
  }

  // 7. Budget ownership
  const budgetLevel = input.budgetLevel ?? "CAMPAIGN";

  if (
    budgetLevel !== "CAMPAIGN" &&
    budgetLevel !== "AD_SET"
  ) {
    throw new MetaAdsCampaignCreationError(
      "budgetLevel must be CAMPAIGN or AD_SET.",
      400,
    );
  }

  const hasDailyBudget = input.dailyBudgetAmount !== undefined;
  const hasLifetimeBudget = input.lifetimeBudgetAmount !== undefined;

  if (hasDailyBudget && hasLifetimeBudget) {
    throw new MetaAdsCampaignCreationError(
      "Provide either a daily budget or a lifetime budget, not both.",
      400,
    );
  }

  let dailyBudgetMinorUnits: string | undefined;
  let lifetimeBudgetMinorUnits: string | undefined;

  let bidStrategy = input.bidStrategy;

  const supportedBidStrategies: MetaAdsBidStrategy[] = [
    "LOWEST_COST_WITHOUT_CAP",
    "LOWEST_COST_WITH_BID_CAP",
    "COST_CAP",
    "LOWEST_COST_WITH_MIN_ROAS",
  ];

  // 8. Campaign-level budget validation
  if (budgetLevel === "CAMPAIGN") {
    if (!hasDailyBudget && !hasLifetimeBudget) {
      throw new MetaAdsCampaignCreationError(
        "Campaign-level budgeting requires a daily or lifetime budget.",
        400,
      );
    }

    if (!input.budgetCurrency?.trim()) {
      throw new MetaAdsCampaignCreationError(
        "Account currency is required for campaign budget conversion.",
        400,
      );
    }

    if (hasDailyBudget) {
      dailyBudgetMinorUnits = toMetaMinorCurrencyUnits(
        input.dailyBudgetAmount!,
        input.budgetCurrency,
      );
    }

    if (hasLifetimeBudget) {
      lifetimeBudgetMinorUnits = toMetaMinorCurrencyUnits(
        input.lifetimeBudgetAmount!,
        input.budgetCurrency,
      );
    }

    if (
      bidStrategy !== undefined &&
      !supportedBidStrategies.includes(bidStrategy)
    ) {
      throw new MetaAdsCampaignCreationError(
        "Unsupported Campaign bid strategy.",
        400,
      );
    }
  }

  // 9. Ad Set-level budget validation
  if (budgetLevel === "AD_SET") {
    if (hasDailyBudget || hasLifetimeBudget) {
      throw new MetaAdsCampaignCreationError(
        "Campaign budget fields must be omitted when using Ad Set-level budgeting.",
        400,
      );
    }

    if (bidStrategy !== undefined) {
      throw new MetaAdsCampaignCreationError(
        "Campaign bidStrategy must be omitted when using Ad Set-level budgeting. Configure bidding in the Ad Set.",
        400,
      );
    }
  }

  // 10. Campaign schedule
  const campaignSchedule = normalizeMetaSchedule(
    input.startTime,
    input.stopTime,
    hasLifetimeBudget && budgetLevel === "CAMPAIGN",
  );

  return {
    name,
    objective,
    specialAdCategories,
    buyingType,
    validateOnly,
    confirm: input.confirm,

    budgetLevel,
    dailyBudgetMinorUnits,
    lifetimeBudgetMinorUnits,
    bidStrategy,

    isAdsetBudgetSharingEnabled:
      input.isAdsetBudgetSharingEnabled,

    startTime: campaignSchedule.startTime,
    stopTime: campaignSchedule.endTime,
  };
}

function getMetaErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as MetaApiErrorBody).error;
    if (error?.message) {
      const code = error.code === undefined ? "" : ` (code ${error.code})`;
      const type = error.type ? ` ${error.type}` : "";
      return `Meta Ads API request failed with HTTP ${status}${type}${code}: ${error.message}`;
    }
  }

  return `Meta Ads API request failed with HTTP ${status}.`;
}

const META_FLEXIBLE_TARGETING_FIELDS = [
  "interests",
  "behaviors",
  "demographics",
  "life_events",
  "industries",
  "family_statuses",
  "income",
] as const;

function normalizeMetaFlexibleSpec(
  value: unknown,
): MetaFlexibleTargetingGroup[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 20
  ) {
    throw new MetaAdsCampaignCreationError(
      "flexible_spec must contain between 1 and 20 targeting groups.",
      400,
    );
  }

  return value.map((group, groupIndex) => {
    if (
      !group ||
      typeof group !== "object" ||
      Array.isArray(group)
    ) {
      throw new MetaAdsCampaignCreationError(
        `flexible_spec group ${groupIndex} must be an object.`,
        400,
      );
    }

    const normalizedGroup: Record<
      string,
      MetaTargetingOption[]
    > = {};

    const entries = Object.entries(group);

    if (entries.length === 0) {
      throw new MetaAdsCampaignCreationError(
        `flexible_spec group ${groupIndex} cannot be empty.`,
        400,
      );
    }

    for (const [field, options] of entries) {
      if (
        !META_FLEXIBLE_TARGETING_FIELDS.includes(
          field as (typeof META_FLEXIBLE_TARGETING_FIELDS)[number],
        )
      ) {
        throw new MetaAdsCampaignCreationError(
          `Unsupported detailed targeting field: ${field}.`,
          400,
        );
      }

      if (
        !Array.isArray(options) ||
        options.length === 0 ||
        options.length > 100
      ) {
        throw new MetaAdsCampaignCreationError(
          `${field} must contain between 1 and 100 options.`,
          400,
        );
      }

      const normalizedOptions = options.map(
        (option: unknown) => {
          if (
            !option ||
            typeof option !== "object" ||
            !("id" in option) ||
            !("name" in option)
          ) {
            throw new MetaAdsCampaignCreationError(
              `Each ${field} option requires an ID and name.`,
              400,
            );
          }

          const id = String(option.id).trim();
          const name = String(option.name).trim();

          if (!/^\d+$/.test(id) || !name) {
            throw new MetaAdsCampaignCreationError(
              `Each ${field} option must have a valid numeric ID and name.`,
              400,
            );
          }

          return { id, name };
        },
      );

      normalizedGroup[field] = [
        ...new Map(
          normalizedOptions.map((option) => [
            option.id,
            option,
          ]),
        ).values(),
      ];
    }

    return normalizedGroup as MetaFlexibleTargetingGroup;
  });
}

function normalizeMetaGeoLocations(
  // value: MetaGeoLocations | MetaExcludedGeoLocations | undefined,
  value: any,
  fieldName: string,
  requireIncludedLocation = false,
): MetaGeoLocations | MetaExcludedGeoLocations {
  if (!value || typeof value !== "object") {
    throw new MetaAdsCampaignCreationError(
      `${fieldName} must be a valid location object.`,
      400,
    );
  }

  const normalized: any = {};

  // 1. Countries
  if (value.countries !== undefined) {
    if (
      !Array.isArray(value.countries) ||
      !value.countries.every(
        (country: any) =>
          typeof country === "string" && /^[A-Za-z]{2}$/.test(country.trim()),
      )
    ) {
      throw new MetaAdsCampaignCreationError(
        `${fieldName}.countries must contain valid two-letter country codes.`,
        400,
      );
    }

    normalized[`countries`] = [
      ...new Set(
        value.countries.map((country: any) => country.trim().toUpperCase()),
      ),
    ];
  }

  // 2. Country groups
  if (value.country_groups !== undefined) {
    const supportedGroups = [
      "africa",
      "asia",
      "europe",
      "north_america",
      "south_america",
      "oceania",
      "central_america",
      "caribbean",
    ];

    if (
      !Array.isArray(value.country_groups) ||
      !value.country_groups.every(
        (group: any) =>
          typeof group === "string" &&
          supportedGroups.includes(group.trim().toLowerCase()),
      )
    ) {
      throw new MetaAdsCampaignCreationError(
        `${fieldName}.country_groups contains an unsupported group.`,
        400,
      );
    }

    normalized.country_groups = [
      ...new Set(
        value.country_groups.map((group: any) => group.trim().toLowerCase()),
      ),
    ];
  }

  // 3. Regions
  if (value.regions !== undefined) {
    if (
      !Array.isArray(value.regions) ||
      !value.regions.every(
        (item: any) => typeof item?.key === "string" && item.key.trim().length > 0,
      )
    ) {
      throw new MetaAdsCampaignCreationError(
        `${fieldName}.regions must contain valid Meta region keys.`,
        400,
      );
    }

    normalized.regions = value.regions.map((item: any) => ({
      key: item.key.trim(),
    }));
  }

  // 4. Cities and optional radius
  if (value.cities !== undefined) {
    if (
      !Array.isArray(value.cities) ||
      !value.cities.every(
        (city: any) => typeof city?.key === "string" && city.key.trim().length > 0,
      )
    ) {
      throw new MetaAdsCampaignCreationError(
        `${fieldName}.cities must contain valid Meta city keys.`,
        400,
      );
    }

    normalized.cities = value.cities.map((city: any) => {
      const hasRadius = city.radius !== undefined;
      const hasUnit = city.distance_unit !== undefined;

      if (hasRadius !== hasUnit) {
        throw new MetaAdsCampaignCreationError(
          "City radius and distance_unit must be provided together.",
          400,
        );
      }

      if (
        hasRadius &&
        (!Number.isFinite(city.radius) ||
          city.radius! <= 0 ||
          !["mile", "kilometer"].includes(city.distance_unit!))
      ) {
        throw new MetaAdsCampaignCreationError(
          "City radius must be positive and use mile or kilometer.",
          400,
        );
      }

      return {
        key: city.key.trim(),
        ...(hasRadius && {
          radius: city.radius,
          distance_unit: city.distance_unit,
        }),
      };
    });
  }

  // 5. Postal codes
  if (value.zips !== undefined) {
    if (
      !Array.isArray(value.zips) ||
      !value.zips.every(
        (zip: any) => typeof zip?.key === "string" && zip.key.trim().length > 0,
      )
    ) {
      throw new MetaAdsCampaignCreationError(
        `${fieldName}.zips must contain valid Meta postal location keys.`,
        400,
      );
    }

    normalized.zips = value.zips.map((zip: any) => ({
      key: zip.key.trim(),
    }));
  }

  // 6. Custom radius locations
  if (value.custom_locations !== undefined) {
    if (!Array.isArray(value.custom_locations)) {
      throw new MetaAdsCampaignCreationError(
        `${fieldName}.custom_locations must be an array.`,
        400,
      );
    }

    normalized.custom_locations = value.custom_locations.map((location: any) => {
      if (
        !Number.isFinite(location.latitude) ||
        location.latitude < -90 ||
        location.latitude > 90
      ) {
        throw new MetaAdsCampaignCreationError(
          "Custom location latitude must be between -90 and 90.",
          400,
        );
      }

      if (
        !Number.isFinite(location.longitude) ||
        location.longitude < -180 ||
        location.longitude > 180
      ) {
        throw new MetaAdsCampaignCreationError(
          "Custom location longitude must be between -180 and 180.",
          400,
        );
      }

      if (
        !Number.isFinite(location.radius) ||
        location.radius <= 0 ||
        !["mile", "kilometer"].includes(location.distance_unit)
      ) {
        throw new MetaAdsCampaignCreationError(
          "Custom location requires a positive radius and valid distance unit.",
          400,
        );
      }

      return {
        latitude: location.latitude,
        longitude: location.longitude,
        radius: location.radius,
        distance_unit: location.distance_unit,
        ...(location.address_string?.trim() && {
          address_string: location.address_string.trim(),
        }),
        ...(location.country?.trim() && {
          country: location.country.trim().toUpperCase(),
        }),
        ...(location.region_id !== undefined && {
          region_id: location.region_id,
        }),
        ...(location.primary_city_id !== undefined && {
          primary_city_id: location.primary_city_id,
        }),
      };
    });
  }

  // 7. Location types
  if (value[`location_types`] !== undefined) {
    const supportedTypes: MetaLocationType[] = ["home", "recent", "travel_in"];

    const types = value[`location_types`];

    const validCombination =
      Array.isArray(types) &&
      types.length > 0 &&
      types.length <= 2 &&
      types.every((type) => supportedTypes.includes(type)) &&
      new Set(types).size === types.length &&
      (types.length === 1 ||
        (types.length === 2 &&
          types.includes("home") &&
          types.includes("recent")));

    if (!validCombination) {
      throw new MetaAdsCampaignCreationError(
        "Location types must be home, recent, travel_in, or home and recent together.",
        400,
      );
    }

    normalized.location_types = types;
  }

  // 8. At least one included geographic selection is required
  if (requireIncludedLocation) {
    const hasLocation = Boolean(
      normalized.countries?.length ||
      normalized.country_groups?.length ||
      normalized.regions?.length ||
      normalized.cities?.length ||
      normalized.zips?.length ||
      normalized.custom_locations?.length,
    );

    if (!hasLocation) {
      throw new MetaAdsCampaignCreationError(
        "Select at least one country, region, city, postal code or custom location.",
        400,
      );
    }
  }

  return normalized;
}
function normalizeMetaNumericOptions(
  values: number[] | undefined,
  fieldName: string,
): number[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    !values.every(
      (value) =>
        Number.isSafeInteger(value) &&
        value > 0,
    )
  ) {
    throw new MetaAdsCampaignCreationError(
      `${fieldName} must contain positive integer IDs.`,
      400,
    );
  }

  return [...new Set(values)];
}

function buildMetaAdvantageAudienceTargeting(
  settings?: MetaAdvantageAudienceSettings,
  deviceExpansion?: boolean,
) {
  if (
    settings !== undefined &&
    typeof settings.enabled !== "boolean"
  ) {
    throw new MetaAdsCampaignCreationError(
      "Advantage+ audience enabled must be a boolean.",
      400,
    );
  }

  const individualSetting: Record<string, 0 | 1> = {};

  if (settings?.ageAsSuggestion !== undefined) {
    individualSetting[`age`] =
      settings.ageAsSuggestion ? 1 : 0;
  }

  if (settings?.genderAsSuggestion !== undefined) {
    individualSetting[`gender`] =
      settings.genderAsSuggestion ? 1 : 0;
  }

  if (deviceExpansion !== undefined) {
    individualSetting[`device`] =
      deviceExpansion ? 1 : 0;
  }

  const targetingAutomation =
    settings !== undefined
      ? {
        advantage_audience: settings.enabled ? 1 : 0,

        ...(settings.enabled &&
          Object.keys(individualSetting).length > 0 && {
          individual_setting: individualSetting,
        }),
      }
      : undefined;

  const targetingRelaxationTypes: any = {};

  if (settings?.customAudienceExpansion !== undefined) {
    targetingRelaxationTypes.custom_audience =
      settings.customAudienceExpansion ? 1 : 0;
  }

  if (settings?.lookalikeExpansion !== undefined) {
    targetingRelaxationTypes.lookalike =
      settings.lookalikeExpansion ? 1 : 0;
  }

  return {
    ...(targetingAutomation && {
      targeting_automation: targetingAutomation,
    }),

    ...(Object.keys(targetingRelaxationTypes).length > 0 && {
      targeting_relaxation_types: targetingRelaxationTypes,
    }),
  };
}
export async function createMetaAdsAd(
  context: MetaAdsCreationContext,
  input: CreateMetaAdsAdInput,
): Promise<MetaAdsAdCreationResult> {
  // 1. Validate Ad name
  const name = input.name?.trim();

  if (!name || name.length > 255) {
    throw new MetaAdsCampaignCreationError(
      "Ad name is required and must not exceed 255 characters.",
      400,
    );
  }

  // 2. Validate Ad Set ID
  const adSetId = input.adSetId?.trim();

  if (!adSetId || !/^\d+$/.test(adSetId)) {
    throw new MetaAdsCampaignCreationError(
      "A valid numeric Ad Set ID is required.",
      400,
    );
  }

  // 3. Validate Creative ID
  const creativeId = input.creativeId?.trim();

  if (!creativeId || !/^\d+$/.test(creativeId)) {
    throw new MetaAdsCampaignCreationError(
      "A valid numeric Creative ID is required.",
      400,
    );
  }

  // 4. Validate mutation mode
  const validateOnly = input.validateOnly ?? true;

  if (typeof validateOnly !== "boolean") {
    throw new MetaAdsCampaignCreationError(
      "validateOnly must be a boolean.",
      400,
    );
  }

  if (!validateOnly && input.confirm !== true) {
    throw new MetaAdsCampaignCreationError(
      "Live Meta Ads creation requires validateOnly: false and confirm: true.",
      400,
    );
  }

  // 5. Validation-only response
  if (validateOnly) {
    return {
      validateOnly: true,
      adAccountId: context.adAccountId,
      adId: null,
      adSetId,
      creativeId,
      name,
      status: "PAUSED",
      metaResponse: null,
    };
  }

  // 6. Build Meta Graph API request
  const url = new URL(
    `https://graph.facebook.com/${context.apiVersion}/${context.adAccountId}/ads`,
  );

  const form = new URLSearchParams({
    name,
    adset_id: adSetId,
    creative: JSON.stringify({
      creative_id: creativeId,
    }),
    status: "PAUSED",
  });

  // 7. Call Meta API
  let response: Response;
  let responseBody: unknown;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(30_000),
    });

    responseBody = await response.json().catch(() => null);
  } catch (error) {
    throw new MetaAdsCampaignCreationError(
      error instanceof Error
        ? `Could not reach Meta Graph API: ${error.message}`
        : "Could not reach Meta Graph API.",
      502,
    );
  }

  // 8. Handle API errors
  if (!response.ok) {
    throw new MetaAdsCampaignCreationError(
      getMetaErrorMessage(responseBody, response.status),
      response.status,
      responseBody,
    );
  }

  // 9. Verify Ad ID
  if (
    !responseBody ||
    typeof responseBody !== "object" ||
    !("id" in responseBody) ||
    typeof (responseBody as { id?: unknown }).id !== "string"
  ) {
    throw new MetaAdsCampaignCreationError(
      "Meta Ads returned a successful response without an Ad ID.",
      502,
      responseBody,
    );
  }

  const adId = (responseBody as { id: string }).id;

  return {
    validateOnly: false,
    adAccountId: context.adAccountId,
    adId,
    adSetId,
    creativeId,
    name,
    status: "PAUSED",
    metaResponse: responseBody as Record<string, unknown>,
  };
}
export interface MetaAdvantageAudienceSettings {
  enabled: boolean;

  // Allow Meta to treat age/gender selections as suggestions.
  ageAsSuggestion?: boolean;
  genderAsSuggestion?: boolean;

  // Audience expansion controls.
  customAudienceExpansion?: boolean;
  lookalikeExpansion?: boolean;
}
export type MetaPublisherPlatform =
  | "facebook"
  | "instagram"
  | "audience_network"
  | "messenger"
  | "threads"
  | "whatsapp";

export type MetaAdsCampaignObjective =
  | "OUTCOME_AWARENESS"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_APP_PROMOTION";

export type MetaAdsDestinationType =
  | "WEBSITE"
  | "ON_AD"
  | "ON_POST"
  | "ON_PAGE"
  | "APP_STORE"
  | "MESSENGER"
  | "WHATSAPP"
  | "INSTAGRAM_DIRECT";

export interface MetaAdsPromotedObject {
  pixel_id?: string;
  custom_event_type?: string;
  custom_event_str?: string;

  page_id?: string;

  application_id?: string;
  object_store_url?: string;

  custom_conversion_id?: string;
  offline_conversion_data_set_id?: string;
  product_set_id?: string;

}

export type MetaDevicePlatform =
  | "mobile"
  | "desktop";

export interface MetaAdsPlacementSettings {
  mode: "AUTOMATIC" | "MANUAL";

  publisherPlatforms?: MetaPublisherPlatform[];

  facebookPositions?: string[];
  instagramPositions?: string[];
  audienceNetworkPositions?: string[];
  messengerPositions?: string[];
  threadsPositions?: string[];
  whatsappPositions?: string[];

  devicePlatforms?: MetaDevicePlatform[];

  // false = keep selected devices strict where supported
  // true = permit device expansion where supported
  deviceExpansion?: boolean;
}
export interface MetaAdsAttributionSpec {
  event_type:
  | "CLICK_THROUGH"
  | "VIEW_THROUGH"
  | "ENGAGED_VIEW";

  window_days: number;
}


interface MetaObjectiveValidationInput {
  campaignObjective: MetaAdsCampaignObjective;
  optimizationGoal: string;
  billingEvent: string;
  destinationType?: MetaAdsDestinationType;
  promotedObject?: MetaAdsPromotedObject;
}

interface MetaObjectiveValidationResult {
  destinationType?: MetaAdsDestinationType;
}

function validateMetaObjectiveCompatibility(
  input: MetaObjectiveValidationInput,
): MetaObjectiveValidationResult {
  const objective = input.campaignObjective;
  const goal = input.optimizationGoal;
  const billingEvent = input.billingEvent;

  // 1. Validate Campaign objective
  const supportedObjectives = Object.keys(
    META_OPTIMIZATION_GOALS_BY_OBJECTIVE,
  );

  if (
    !supportedObjectives.includes(objective)
  ) {
    throw new MetaAdsCampaignCreationError(
      "Unsupported Meta campaign objective.",
      400,
    );
  }

  // 2. Validate objective and optimization-goal combination
  const supportedGoals =
    META_OPTIMIZATION_GOALS_BY_OBJECTIVE[objective];

  if (!supportedGoals.includes(goal)) {
    throw new MetaAdsCampaignCreationError(
      `Optimization goal ${goal} is not supported for campaign objective ${objective}.`,
      400,
    );
  }

  // 3. Validate billing event
  const allowedBillingEvents: any =
    META_BILLING_EVENTS_BY_GOAL[goal] ??
    META_BILLING_EVENTS_BY_GOAL[`DEFAULT`];

  if (!allowedBillingEvents.includes(billingEvent)) {
    throw new MetaAdsCampaignCreationError(
      `Billing event ${billingEvent} is not supported for optimization goal ${goal}.`,
      400,
    );
  }

  // 4. Resolve destination
  let expectedDestination =
    META_REQUIRED_DESTINATION_BY_GOAL[goal];

  if (
    goal === "OFFSITE_CONVERSIONS" ||
    goal === "VALUE"
  ) {
    expectedDestination =
      objective === "OUTCOME_APP_PROMOTION"
        ? "APP_STORE"
        : "WEBSITE";
  }

  if (goal === "CONVERSATIONS") {
    const messagingDestinations: MetaAdsDestinationType[] = [
      "MESSENGER",
      "WHATSAPP",
      "INSTAGRAM_DIRECT",
    ];

    if (
      !input.destinationType ||
      !messagingDestinations.includes(input.destinationType)
    ) {
      throw new MetaAdsCampaignCreationError(
        "CONVERSATIONS requires a messaging destination: MESSENGER, WHATSAPP or INSTAGRAM_DIRECT.",
        400,
      );
    }

    expectedDestination = input.destinationType;
  }

  if (
    input.destinationType &&
    expectedDestination &&
    input.destinationType !== expectedDestination
  ) {
    throw new MetaAdsCampaignCreationError(
      `Destination ${input.destinationType} is incompatible with optimization goal ${goal}. Expected ${expectedDestination}.`,
      400,
    );
  }

  const destinationType =
    input.destinationType ?? expectedDestination;

  // 5. Validate promoted-object identifiers
  const promoted = input.promotedObject;

  const validateNumericId = (
    value: string | undefined,
    fieldName: string,
  ) => {
    if (value !== undefined && !/^\d+$/.test(value.trim())) {
      throw new MetaAdsCampaignCreationError(
        `${fieldName} must be a numeric ID.`,
        400,
      );
    }
  };

  validateNumericId(promoted?.pixel_id, "pixel_id");
  validateNumericId(promoted?.page_id, "page_id");
  validateNumericId(promoted?.application_id, "application_id");
  validateNumericId(promoted?.custom_conversion_id, "custom_conversion_id");
  validateNumericId(
    promoted?.offline_conversion_data_set_id,
    "offline_conversion_data_set_id",
  );
  validateNumericId(promoted?.product_set_id, "product_set_id");

  // 6. Website conversion goals require a conversion source
  if (
    (
      goal === "OFFSITE_CONVERSIONS" ||
      goal === "VALUE"
    ) &&
    objective !== "OUTCOME_APP_PROMOTION"
  ) {
    const hasPixelEvent =
      Boolean(
        promoted?.pixel_id &&
        promoted?.custom_event_type,
      );

    const hasCustomConversion =
      Boolean(promoted?.custom_conversion_id);

    const hasOfflineEvent =
      Boolean(
        promoted?.offline_conversion_data_set_id &&
        promoted?.custom_event_type,
      );

    if (
      !hasPixelEvent &&
      !hasCustomConversion &&
      !hasOfflineEvent
    ) {
      throw new MetaAdsCampaignCreationError(
        `${goal} requires a Pixel with a conversion event, a Custom Conversion ID, or an Offline Conversion Dataset with an event.`,
        400,
      );
    }

    if (
      promoted?.custom_event_type === "OTHER" &&
      !promoted?.custom_event_str?.trim()
    ) {
      throw new MetaAdsCampaignCreationError(
        "custom_event_str is required when custom_event_type is OTHER.",
        400,
      );
    }
  }

  // 7. App promotion requirements
  if (
    objective === "OUTCOME_APP_PROMOTION" &&
    (
      goal === "APP_INSTALLS" ||
      goal === "OFFSITE_CONVERSIONS" ||
      goal === "VALUE"
    )
  ) {
    if (
      !promoted?.application_id ||
      !promoted?.object_store_url
    ) {
      throw new MetaAdsCampaignCreationError(
        `${goal} for App Promotion requires application_id and object_store_url.`,
        400,
      );
    }

    try {
      const storeUrl = new URL(promoted.object_store_url);

      if (storeUrl.protocol !== "https:") {
        throw new Error("Invalid store URL");
      }
    } catch {
      throw new MetaAdsCampaignCreationError(
        "object_store_url must be a valid HTTPS URL.",
        400,
      );
    }

    if (
      goal === "OFFSITE_CONVERSIONS" ||
      goal === "VALUE"
    ) {
      if (!promoted.custom_event_type) {
        throw new MetaAdsCampaignCreationError(
          "App conversion optimization requires custom_event_type.",
          400,
        );
      }
    }
  }

  // 8. Page-dependent objectives
  if (
    [
      "LEAD_GENERATION",
      "PAGE_LIKES",
      "POST_ENGAGEMENT",
    ].includes(goal) &&
    !promoted?.page_id
  ) {
    throw new MetaAdsCampaignCreationError(
      `${goal} requires promoted_object.page_id.`,
      400,
    );
  }

  return {
    destinationType,
  };
}

export async function createMetaAdsAdSet(
  context: MetaAdsCreationContext,
  input: CreateMetaAdsAdSetInput,
): Promise<MetaAdsAdSetCreationResult> {
  const name = input.name?.trim();
  const campaignId = input.campaignId?.trim();


  const optimizationGoal = input.optimization_goal?.trim().toUpperCase();
  const billingEvent = input.billing_event?.trim().toUpperCase();

  if (!optimizationGoal || !billingEvent) {
    throw new MetaAdsCampaignCreationError(
      "Optimization goal and billing event are required.",
      400,
    );
  }

  const objectiveValidation =
    validateMetaObjectiveCompatibility({
      campaignObjective: input.campaignObjective,
      optimizationGoal,
      billingEvent,
      destinationType: input.destinationType,
      promotedObject: input.promoted_object,
    });
  // 1. Validate Campaign ID
  if (!campaignId || !/^\d+$/.test(campaignId)) {
    throw new MetaAdsCampaignCreationError(
      "A valid numeric Meta campaign ID is required.",
      400,
    );
  }

  // 2. Validate Ad Set name
  if (!name || name.length > 255 || /[\0\r\n]/.test(name)) {
    throw new MetaAdsCampaignCreationError(
      "Ad Set name is required and must not exceed 255 characters.",
      400,
    );
  }

  // 3. Validate optimization goal and billing event
  if (!optimizationGoal || !billingEvent) {
    throw new MetaAdsCampaignCreationError(
      "Optimization goal and billing event are required.",
      400,
    );
  }
  const targeting = input.targeting;

  // 4. Validate targeting
  // Validate and normalize included locations
  const normalizedGeoLocations = normalizeMetaGeoLocations(
    input.targeting?.geo_locations,
    "geo_locations",
    true,
  );

  // Validate excluded locations when supplied
  const normalizedExcludedLocations = input.targeting?.excluded_geo_locations
    ? normalizeMetaGeoLocations(
      input.targeting.excluded_geo_locations,
      "excluded_geo_locations",
      false,
    )
    : undefined;
  // 1. Validate Advantage+ age range suggestion
  if (targeting.age_range !== undefined) {
    const [minAge, maxAge] = targeting.age_range;

    if (
      !Array.isArray(targeting.age_range) ||
      targeting.age_range.length !== 2 ||
      !Number.isInteger(minAge) ||
      !Number.isInteger(maxAge) ||
      minAge < 18 ||
      maxAge > 65 ||
      minAge > maxAge
    ) {
      throw new MetaAdsCampaignCreationError(
        "age_range must contain a valid [minimum, maximum] range between 18 and 65.",
        400,
      );
    }
  }

  const includedAudiences = normalizeMetaAudienceReferences(
    input.targeting.custom_audiences,
    "custom_audiences",
  );

  const excludedAudiences = normalizeMetaAudienceReferences(
    input.targeting.excluded_custom_audiences,
    "excluded_custom_audiences",
  );

  const includedAudienceIds = new Set(
    (includedAudiences ?? []).map((item) => item.id),
  );

  const conflictingAudience = (excludedAudiences ?? []).find(
    (item) => includedAudienceIds.has(item.id),
  );

  if (conflictingAudience) {
    throw new MetaAdsCampaignCreationError(
      "The same Custom Audience cannot be both included and excluded.",
      400,
    );
  }


  // 2. Normalize locale IDs
  const normalizedLocales = normalizeMetaNumericOptions(
    targeting.locales,
    "locales",
  );

  // 3. Normalize education status IDs
  const normalizedEducationStatuses = normalizeMetaNumericOptions(
    targeting.education_statuses,
    "education_statuses",
  );

  // 4. Normalize relationship status IDs
  const normalizedRelationshipStatuses = normalizeMetaNumericOptions(
    targeting.relationship_statuses,
    "relationship_statuses",
  );

  // Validate detailed targeting selections.
  const normalizedFlexibleSpec = normalizeMetaFlexibleSpec(
    input.targeting.flexible_spec,
  );

  // Stage 5: Advantage+ audience
  const advantageTargeting =
    buildMetaAdvantageAudienceTargeting(
      input.advantageAudience,
      input.placements?.deviceExpansion,
    );

  // Stage 6: Placements and devices
  const placementTargeting =
    normalizeMetaPlacementSettings(input.placements);
  // 5. Normalize college graduation years
  if (
    targeting.college_years !== undefined &&
    (
      !Array.isArray(targeting.college_years) ||
      targeting.college_years.length === 0 ||
      !targeting.college_years.every(
        (year) =>
          Number.isInteger(year) &&
          year >= 1900 &&
          year <= new Date().getFullYear() + 10,
      )
    )
  ) {
    throw new MetaAdsCampaignCreationError(
      "college_years must contain valid graduation years.",
      400,
    );
  }

  const restrictedCategories = [
    "HOUSING",
    "EMPLOYMENT",
    "CREDIT",
  ];

  const hasRestrictedCategory = (
    input.specialAdCategories ?? []
  ).some((category) =>
    restrictedCategories.includes(category.toUpperCase()),
  );

  const hasRelaxableTargeting = Boolean(
    normalizedFlexibleSpec?.length ||
    includedAudiences?.length,
  );
  if (
    hasRestrictedCategory &&
    input.placements?.deviceExpansion === true
  ) {
    throw new MetaAdsCampaignCreationError(
      "Device expansion settings are unavailable for this Special Ad Category.",
      400,
    );
  }
  // 1. Determine budget ownership
  const hasDailyBudget = input.dailyBudgetAmount !== undefined;
  const hasLifetimeBudget = input.lifetimeBudgetAmount !== undefined;

  if (hasDailyBudget && hasLifetimeBudget) {
    throw new MetaAdsCampaignCreationError(
      "Provide either a daily budget or a lifetime budget, not both.",
      400,
    );
  }

  const budgetLevel =
    input.budgetLevel ??
    (hasDailyBudget || hasLifetimeBudget ? "AD_SET" : "CAMPAIGN");

  if (
    budgetLevel !== "CAMPAIGN" &&
    budgetLevel !== "AD_SET"
  ) {
    throw new MetaAdsCampaignCreationError(
      "budgetLevel must be CAMPAIGN or AD_SET.",
      400,
    );
  }

  // 2. Validate budget ownership
  if (
    budgetLevel === "CAMPAIGN" &&
    (hasDailyBudget || hasLifetimeBudget)
  ) {
    throw new MetaAdsCampaignCreationError(
      "Ad Set budget fields must be omitted when the Campaign owns the budget.",
      400,
    );
  }

  if (
    budgetLevel === "AD_SET" &&
    !hasDailyBudget &&
    !hasLifetimeBudget
  ) {
    throw new MetaAdsCampaignCreationError(
      "An Ad Set-level daily or lifetime budget is required.",
      400,
    );
  }

  // 3. Validate and normalize budgets
  let dailyBudgetMinorUnits: string | undefined;
  let lifetimeBudgetMinorUnits: string | undefined;
  let bidAmountMinorUnits: string | undefined;

  if (
    hasDailyBudget ||
    hasLifetimeBudget ||
    input.bidAmountInput !== undefined
  ) {
    if (!input.budgetCurrency?.trim()) {
      throw new MetaAdsCampaignCreationError(
        "Account currency is required for budget and bid conversion.",
        400,
      );
    }
  }

  if (hasDailyBudget) {
    dailyBudgetMinorUnits = toMetaMinorCurrencyUnits(
      input.dailyBudgetAmount!,
      input.budgetCurrency!,
    );
  }

  if (hasLifetimeBudget) {
    lifetimeBudgetMinorUnits = toMetaMinorCurrencyUnits(
      input.lifetimeBudgetAmount!,
      input.budgetCurrency!,
    );
  }

  // 4. Validate Ad Set bidding
  const supportedBidStrategies: MetaAdsBidStrategy[] = [
    "LOWEST_COST_WITHOUT_CAP",
    "LOWEST_COST_WITH_BID_CAP",
    "COST_CAP",
    "LOWEST_COST_WITH_MIN_ROAS",
  ];

  const bidStrategy =
    input.bid_strategy ??
    (budgetLevel === "AD_SET"
      ? "LOWEST_COST_WITHOUT_CAP"
      : undefined);

  if (
    bidStrategy !== undefined &&
    !supportedBidStrategies.includes(bidStrategy)
  ) {
    throw new MetaAdsCampaignCreationError(
      "Unsupported Meta Ads bid strategy.",
      400,
    );
  }

  const requiresBidAmount =
    bidStrategy === "LOWEST_COST_WITH_BID_CAP" ||
    bidStrategy === "COST_CAP";

  if (requiresBidAmount) {
    if (
      input.bidAmountInput === undefined ||
      !input.budgetCurrency?.trim()
    ) {
      throw new MetaAdsCampaignCreationError(
        "A bid amount and account currency are required for this bid strategy.",
        400,
      );
    }

    bidAmountMinorUnits = toMetaMinorCurrencyUnits(
      input.bidAmountInput,
      input.budgetCurrency,
    );
  } else if (
    input.bidAmountInput !== undefined &&
    bidStrategy !== "LOWEST_COST_WITH_MIN_ROAS"
  ) {
    throw new MetaAdsCampaignCreationError(
      "bidAmountInput is not applicable to the selected bid strategy.",
      400,
    );
  }

  // 5. Validate Minimum ROAS
  if (bidStrategy === "LOWEST_COST_WITH_MIN_ROAS") {
    const roasFloor = input.bid_constraints?.roas_average_floor;

    if (
      optimizationGoal !== "VALUE" ||
      !Number.isSafeInteger(roasFloor) ||
      roasFloor! <= 0
    ) {
      throw new MetaAdsCampaignCreationError(
        "Minimum ROAS requires VALUE optimization and a positive ROAS floor.",
        400,
      );
    }
  } else if (input.bid_constraints !== undefined) {
    throw new MetaAdsCampaignCreationError(
      "bid_constraints are only supported with LOWEST_COST_WITH_MIN_ROAS.",
      400,
    );
  }
  const normalizedSchedule = normalizeMetaSchedule(
    input.startTime,
    input.endTime,
    hasLifetimeBudget,
  );

  const normalizedAttributionSpec =
    normalizeMetaAttributionSpec(
      input.attributionSpec,
    );

  if (
    input.destinationType !== undefined &&
    (
      typeof input.destinationType !== "string" ||
      !input.destinationType.trim()
    )
  ) {
    throw new MetaAdsCampaignCreationError(
      "destinationType must be a non-empty string.",
      400,
    );
  }
  if (
    hasRestrictedCategory &&
    hasRelaxableTargeting &&
    input.advantageAudience === undefined
  ) {
    throw new MetaAdsCampaignCreationError(
      "Explicitly configure Advantage+ audience for this Special Ad Category.",
      400,
    );
  }

  if (
    hasRestrictedCategory &&
    [
      targeting.age_min,
      targeting.age_max,
      targeting.age_range,
      targeting.genders,
      targeting.education_statuses,
      targeting.relationship_statuses,
      targeting.college_years,
    ].some((value) => value !== undefined)
  ) {
    throw new MetaAdsCampaignCreationError(
      "Age, gender and demographic restrictions cannot be supplied for this Special Ad Category.",
      400,
    );
  }


  // Detailed-targeting exclusions are not supported.
  // Custom Audience exclusions will be handled separately.
  if ((input.targeting as Record<string, unknown>)[`exclusions`] !== undefined) {
    throw new MetaAdsCampaignCreationError(
      "Detailed targeting exclusions are no longer supported. Use excluded custom audiences for audience exclusions.",
      400,
    );
  }
  // const normalizedTargeting: MetaAdsTargeting = {
  //   ...input.targeting,
  //   geo_locations: normalizedGeoLocations as MetaGeoLocations,

  //   ...(normalizedExcludedLocations && {
  //     excluded_geo_locations:
  //       normalizedExcludedLocations as MetaExcludedGeoLocations,
  //   }),
  // };


  const normalizedTargeting: MetaAdsTargeting = {
    ...input.targeting,

    geo_locations: normalizedGeoLocations as MetaGeoLocations,

    ...(normalizedExcludedLocations && {
      excluded_geo_locations:
        normalizedExcludedLocations as MetaExcludedGeoLocations,
    }),

    ...(normalizedLocales && {
      locales: normalizedLocales,
    }),

    ...(normalizedEducationStatuses && {
      education_statuses: normalizedEducationStatuses,
    }),

    ...(normalizedRelationshipStatuses && {
      relationship_statuses: normalizedRelationshipStatuses,
    }),


    ...(normalizedFlexibleSpec && {
      flexible_spec: normalizedFlexibleSpec,
    }),
    // Stage 4: Custom and Lookalike Audiences
    ...(includedAudiences && {
      custom_audiences: includedAudiences,
    }),

    ...(excludedAudiences && {
      excluded_custom_audiences: excludedAudiences,
    }),

    // Stage 5: Advantage+ audience
    ...advantageTargeting,

    // Stage 6: Placement and device settings
    ...placementTargeting,
  };

  if (
    targeting.age_min !== undefined &&
    (!Number.isInteger(targeting.age_min) ||
      targeting.age_min < 18 ||
      targeting.age_min > 65)
  ) {
    throw new MetaAdsCampaignCreationError(
      "Minimum age must be between 18 and 65.",
      400,
    );
  }

  if (
    targeting.age_max !== undefined &&
    (!Number.isInteger(targeting.age_max) ||
      targeting.age_max < 18 ||
      targeting.age_max > 65)
  ) {
    throw new MetaAdsCampaignCreationError(
      "Maximum age must be between 18 and 65.",
      400,
    );
  }

  if (
    targeting.age_min !== undefined &&
    targeting.age_max !== undefined &&
    targeting.age_min > targeting.age_max
  ) {
    throw new MetaAdsCampaignCreationError(
      "Minimum age cannot be greater than maximum age.",
      400,
    );
  }

  if (
    targeting.genders !== undefined &&
    (!Array.isArray(targeting.genders) ||
      targeting.genders.some((gender) => gender !== 1 && gender !== 2))
  ) {
    throw new MetaAdsCampaignCreationError(
      "Targeting genders must contain only 1 (male) or 2 (female).",
      400,
    );
  }



  // 8. Validate mutation mode
  const validateOnly = input.validateOnly ?? true;

  if (typeof validateOnly !== "boolean") {
    throw new MetaAdsCampaignCreationError(
      "validateOnly must be a boolean.",
      400,
    );
  }

  if (!validateOnly && input.confirm !== true) {
    throw new MetaAdsCampaignCreationError(
      "Live Meta Ads Ad Set creation requires validateOnly: false and confirm: true.",
      400,
    );
  }

  // 9. Local validation-only response
  if (validateOnly) {
    return {
      validateOnly: true,
      adAccountId: context.adAccountId,
      campaignId,
      adSetId: null,
      name,
      status: "PAUSED",
      metaResponse: null,
    };
  }

  // 10. Build Meta Graph API request
  const url = new URL(
    `https://graph.facebook.com/${context.apiVersion}/${context.adAccountId}/adsets`,
  );

  const form = new URLSearchParams({
    name,
    campaign_id: campaignId,
    optimization_goal: optimizationGoal,
    billing_event: billingEvent,
    targeting: JSON.stringify(normalizedTargeting),
    status: "PAUSED",
  });
  // Destination resolved by objective compatibility validation
  if (objectiveValidation.destinationType) {
    form.set(
      "destination_type",
      objectiveValidation.destinationType,
    );
  }

  // Only Ad Set-level budgets belong in the Ad Set request
  if (budgetLevel === "AD_SET") {
    if (dailyBudgetMinorUnits) {
      form.set("daily_budget", dailyBudgetMinorUnits);
    }

    if (lifetimeBudgetMinorUnits) {
      form.set("lifetime_budget", lifetimeBudgetMinorUnits);
    }
  }

  // Ad Set bidding
  if (bidStrategy) {
    form.set("bid_strategy", bidStrategy);
  }

  if (bidAmountMinorUnits) {
    form.set("bid_amount", bidAmountMinorUnits);
  }

  if (input.bid_constraints) {
    form.set(
      "bid_constraints",
      JSON.stringify(input.bid_constraints),
    );
  }

  // Promoted object: add once
  if (input.promoted_object) {
    form.set(
      "promoted_object",
      JSON.stringify(input.promoted_object),
    );
  }

  // Schedule
  if (normalizedSchedule.startTime) {
    form.set("start_time", normalizedSchedule.startTime);
  }

  if (normalizedSchedule.endTime) {
    form.set("end_time", normalizedSchedule.endTime);
  }

  // Attribution
  if (normalizedAttributionSpec) {
    form.set(
      "attribution_spec",
      JSON.stringify(normalizedAttributionSpec),
    );
  }


  // 11. Call Meta API
  let response: Response;
  let responseBody: unknown;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(30_000),
    });

    responseBody = await response.json().catch(() => null);
  } catch (error) {
    throw new MetaAdsCampaignCreationError(
      error instanceof Error
        ? `Could not reach Meta Graph API: ${error.message}`
        : "Could not reach Meta Graph API.",
      502,
    );
  }

  if (!response.ok) {
    throw new MetaAdsCampaignCreationError(
      getMetaErrorMessage(responseBody, response.status),
      response.status,
      responseBody,
    );
  }

  // 12. Verify Meta returned an Ad Set ID
  if (
    !responseBody ||
    typeof responseBody !== "object" ||
    !("id" in responseBody) ||
    typeof (responseBody as { id?: unknown }).id !== "string"
  ) {
    throw new MetaAdsCampaignCreationError(
      "Meta Ads returned a successful response without an Ad Set ID.",
      502,
      responseBody,
    );
  }

  const adSetId = (responseBody as { id: string }).id;

  return {
    validateOnly: false,
    adAccountId: context.adAccountId,
    campaignId,
    adSetId,
    name,
    status: "PAUSED",
    metaResponse: responseBody as Record<string, unknown>,
  };
}
function validateMetaHttpsUrl(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new MetaAdsCampaignCreationError(
      `${fieldName} is required.`,
      400,
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value.trim());
  } catch {
    throw new MetaAdsCampaignCreationError(
      `${fieldName} must be a valid URL.`,
      400,
    );
  }

  if (parsedUrl.protocol !== "https:") {
    throw new MetaAdsCampaignCreationError(
      `${fieldName} must use HTTPS.`,
      400,
    );
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new MetaAdsCampaignCreationError(
      `${fieldName} must not contain embedded credentials.`,
      400,
    );
  }

  return parsedUrl.toString();
}
export async function createMetaAdsAdCreative(
  context: MetaAdsCreationContext,
  input: CreateMetaAdsAdCreativeInput,
): Promise<MetaAdsAdCreativeCreationResult> {
  // 1. Validate creative name
  const name = input.name?.trim();

  if (!name || name.length > 100) {
    throw new MetaAdsCampaignCreationError(
      "Creative name is required and must not exceed 100 characters.",
      400,
    );
  }

  // 2. Validate Facebook Page ID
  const pageId = input.pageId?.trim();

  if (!pageId || !/^\d+$/.test(pageId)) {
    throw new MetaAdsCampaignCreationError(
      "A valid numeric Facebook Page ID is required.",
      400,
    );
  }

  // 3. Validate optional Instagram Actor ID
  const instagramActorId = input.instagramActorId?.trim();

  if (instagramActorId && !/^\d+$/.test(instagramActorId)) {
    throw new MetaAdsCampaignCreationError(
      "Instagram Actor ID must be numeric.",
      400,
    );
  }

  // 4. Validate creative text
  const primaryText = input.primaryText?.trim();
  const headline = input.headline?.trim();
  const description = input.description?.trim();

  if (!primaryText || !headline) {
    throw new MetaAdsCampaignCreationError(
      "Primary text and headline are required.",
      400,
    );
  }

  // 5. Validate image and destination URLs
  const imageUrl = validateMetaHttpsUrl(input.imageUrl, "Creative image URL");

  const destinationUrl = validateMetaHttpsUrl(
    input.destinationUrl,
    "Destination URL",
  );

  // 6. Validate CTA
  const supportedCtas: MetaAdsCallToAction[] = [
    "LEARN_MORE",
    "SHOP_NOW",
    "SIGN_UP",
    "CONTACT_US",
    "GET_QUOTE",
    "DOWNLOAD",
  ];

  if (!supportedCtas.includes(input.callToAction)) {
    throw new MetaAdsCampaignCreationError(
      "Unsupported Meta Ads call-to-action type.",
      400,
    );
  }

  // 7. Validate mutation mode
  const validateOnly = input.validateOnly ?? true;

  if (typeof validateOnly !== "boolean") {
    throw new MetaAdsCampaignCreationError(
      "validateOnly must be a boolean.",
      400,
    );
  }

  if (!validateOnly && input.confirm !== true) {
    throw new MetaAdsCampaignCreationError(
      "Live Ad Creative creation requires validateOnly: false and confirm: true.",
      400,
    );
  }

  // 8. Local validation-only response
  if (validateOnly) {
    return {
      validateOnly: true,
      adAccountId: context.adAccountId,
      creativeId: null,
      name,
      pageId,
      metaResponse: null,
    };
  }

  // 9. Build the Meta Ad Creative payload
  const objectStorySpec = {
    page_id: pageId,

    ...(instagramActorId && {
      instagram_actor_id: instagramActorId,
    }),

    link_data: {
      picture: imageUrl,
      link: destinationUrl,
      message: primaryText,
      name: headline,

      ...(description && {
        description,
      }),

      call_to_action: {
        type: input.callToAction,
        value: {
          link: destinationUrl,
        },
      },
    },
  };

  // 10. Prepare Graph API request
  const url = new URL(
    `https://graph.facebook.com/${context.apiVersion}/${context.adAccountId}/adcreatives`,
  );

  const form = new URLSearchParams({
    name,
    object_story_spec: JSON.stringify(objectStorySpec),
  });

  // 11. Create Ad Creative
  let response: Response;
  let responseBody: unknown;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(30_000),
    });

    responseBody = await response.json().catch(() => null);
  } catch (error) {
    throw new MetaAdsCampaignCreationError(
      error instanceof Error
        ? `Could not reach Meta Graph API: ${error.message}`
        : "Could not reach Meta Graph API.",
      502,
    );
  }

  // 12. Handle Meta API errors
  if (!response.ok) {
    throw new MetaAdsCampaignCreationError(
      getMetaErrorMessage(responseBody, response.status),
      response.status,
      responseBody,
    );
  }

  // 13. Verify Creative ID
  if (
    !responseBody ||
    typeof responseBody !== "object" ||
    !("id" in responseBody) ||
    typeof (responseBody as { id?: unknown }).id !== "string"
  ) {
    throw new MetaAdsCampaignCreationError(
      "Meta Ads returned a successful response without a Creative ID.",
      502,
      responseBody,
    );
  }

  const creativeId = (responseBody as { id: string }).id;

  return {
    validateOnly: false,
    adAccountId: context.adAccountId,
    creativeId,
    name,
    pageId,
    metaResponse: responseBody as Record<string, unknown>,
  };
}


export async function createMetaAdsCampaign(
  context: MetaAdsCreationContext,
  input: CreateMetaAdsCampaignInput,
): Promise<MetaAdsCampaignCreationResult> {
  const validated = validateCreateCampaignInput(input);


  if (validated.validateOnly) {
    return {
      validateOnly: true,
      adAccountId: context.adAccountId,
      campaignId: null,
      name: validated.name,
      objective: validated.objective,
      status: "PAUSED",
      buyingType: validated.buyingType,
      metaResponse: null,
    };
  }

  const url = new URL(
    `https://graph.facebook.com/${context.apiVersion}/${context.adAccountId}/campaigns`,
  );

  const form = new URLSearchParams({
    name: validated.name,
    objective: validated.objective,
    status: "PAUSED",
    buying_type: validated.buyingType,
    special_ad_categories: JSON.stringify(validated.specialAdCategories),
  });


  if (validated.startTime) {
    form.set("start_time", validated.startTime);
  }

  if (validated.stopTime) {
    form.set("stop_time", validated.stopTime);
  }

  // Campaign-level budget
  if (validated.budgetLevel === "CAMPAIGN") {
    if (validated.dailyBudgetMinorUnits) {
      form.set(
        "daily_budget",
        validated.dailyBudgetMinorUnits,
      );
    }

    if (validated.lifetimeBudgetMinorUnits) {
      form.set(
        "lifetime_budget",
        validated.lifetimeBudgetMinorUnits,
      );
    }

    if (validated.bidStrategy) {
      form.set("bid_strategy", validated.bidStrategy);
    }
  }

  if (validated.isAdsetBudgetSharingEnabled !== undefined) {
    form.set(
      "is_adset_budget_sharing_enabled",
      String(validated.isAdsetBudgetSharingEnabled),
    );
  }

  let response: Response;
  let responseBody: unknown;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(30_000),
    });

    responseBody = await response.json().catch(() => null);
  } catch (error) {
    throw new MetaAdsCampaignCreationError(
      error instanceof Error
        ? `Could not reach Meta Graph API: ${error.message}`
        : "Could not reach Meta Graph API.",
      502,
    );
  }

  if (!response.ok) {
    throw new MetaAdsCampaignCreationError(
      getMetaErrorMessage(responseBody, response.status),
      response.status,
      responseBody,
    );
  }

  if (
    !responseBody ||
    typeof responseBody !== "object" ||
    !("id" in responseBody) ||
    typeof (responseBody as { id?: unknown }).id !== "string"
  ) {
    throw new MetaAdsCampaignCreationError(
      "Meta Ads returned a successful response without a campaign ID.",
      502,
      responseBody,
    );
  }

  return {
    validateOnly: false,
    adAccountId: context.adAccountId,
    campaignId: (responseBody as { id: string }).id,
    name: validated.name,
    objective: validated.objective,
    status: "PAUSED",
    buyingType: validated.buyingType,
    metaResponse: responseBody as Record<string, unknown>,
  };
}

export async function getMetaAdsCreationContext(
  userId: string,
  selectedAccountId: string,
): Promise<MetaAdsCreationContext> {
  if (!userId?.trim()) {
    throw new MetaAdsCampaignCreationError(
      "Authenticated user ID is required.",
      401,
    );
  }

  if (!selectedAccountId?.trim()) {
    throw new MetaAdsCampaignCreationError(
      "A Meta Ads account must be selected.",
      400,
    );
  }

  const adAccountId = normalizeAdAccountId(selectedAccountId);
  const accessToken = await getProviderAccessToken(userId, "metaAds");

  return {
    adAccountId,
    accessToken,
    apiVersion: getMetaApiVersion(),
  };
}

export async function createMetaAdsCampaignForUser(
  userId: string,
  selectedAccountId: string,
  input: CreateMetaAdsCampaignBundleInput,
): Promise<MetaAdsCampaignBundleCreationResult> {
  const context = await getMetaAdsCreationContext(
    userId,
    selectedAccountId,
  );

  const validateOnly = input.campaign.validateOnly ?? true;
  const confirm = input.campaign.confirm;

  const budgetLevel = input.campaign.budgetLevel ?? "CAMPAIGN";

  // Keep campaign and Ad Set configuration consistent.
  if (
    input.adSet.budgetLevel !== undefined &&
    input.adSet.budgetLevel !== budgetLevel
  ) {
    throw new MetaAdsCampaignCreationError(
      "Campaign and Ad Set budget levels do not match.",
      400,
    );
  }

  if (
    input.adSet.campaignObjective !== input.campaign.objective
  ) {
    throw new MetaAdsCampaignCreationError(
      "Campaign objective and Ad Set campaignObjective must match.",
      400,
    );
  }

  const adSetInput = {
    ...input.adSet,
    campaignObjective: input.campaign.objective,
    budgetLevel,
    specialAdCategories:
      input.campaign.specialAdCategories ?? [],
    validateOnly,
    confirm,
  };

  const creativeInput = {
    ...input.creative,
    validateOnly,
    confirm,
  };

  // VALIDATION-ONLY FLOW
  // No Meta objects are created in this section.
  if (validateOnly) {
    const campaignResult = await createMetaAdsCampaign(
      context,
      {
        ...input.campaign,
        validateOnly: true,
      },
    );

    const adSetResult = await createMetaAdsAdSet(
      context,
      {
        ...adSetInput,
        campaignId: "1",
        validateOnly: true,
      },
    );

    const creativeResult = await createMetaAdsAdCreative(
      context,
      creativeInput,
    );

    const adResult = await createMetaAdsAd(
      context,
      {
        ...input.ad,
        adSetId: "1",
        creativeId: "1",
        validateOnly: true,
      },
    );

    return {
      validateOnly: true,
      adAccountId: context.adAccountId,
      campaign: campaignResult,
      adSet: {
        ...adSetResult,
        campaignId: null,
      },
      creative: creativeResult,
      ad: {
        ...adResult,
        adSetId: null,
        creativeId: null,
      },
    };
  }

  // LIVE CREATION FLOW
  // Every created object remains PAUSED.
  const partialResult: {
    campaign?: MetaAdsCampaignCreationResult;
    adSet?: MetaAdsAdSetCreationResult;
    creative?: MetaAdsAdCreativeCreationResult;
    ad?: MetaAdsAdCreationResult;
  } = {};

  let failedStep = "campaign";

  try {
    // 1. Campaign
    const campaignResult = await createMetaAdsCampaign(
      context,
      {
        ...input.campaign,
        validateOnly: false,
        confirm: true,
      },
    );

    partialResult.campaign = campaignResult;

    if (!campaignResult.campaignId) {
      throw new MetaAdsCampaignCreationError(
        "Campaign creation did not return a Campaign ID.",
        502,
      );
    }

    // 2. Ad Set
    failedStep = "Ad Set";

    const adSetResult = await createMetaAdsAdSet(
      context,
      {
        ...adSetInput,
        campaignId: campaignResult.campaignId,
        validateOnly: false,
        confirm: true,
      },
    );

    partialResult.adSet = adSetResult;

    if (!adSetResult.adSetId) {
      throw new MetaAdsCampaignCreationError(
        "Ad Set creation did not return an Ad Set ID.",
        502,
      );
    }

    // 3. Creative
    failedStep = "Creative";

    const creativeResult = await createMetaAdsAdCreative(
      context,
      {
        ...creativeInput,
        validateOnly: false,
        confirm: true,
      },
    );

    partialResult.creative = creativeResult;

    if (!creativeResult.creativeId) {
      throw new MetaAdsCampaignCreationError(
        "Creative creation did not return a Creative ID.",
        502,
      );
    }

    // 4. Ad
    failedStep = "Ad";

    const adResult = await createMetaAdsAd(
      context,
      {
        ...input.ad,
        adSetId: adSetResult.adSetId,
        creativeId: creativeResult.creativeId,
        validateOnly: false,
        confirm: true,
      },
    );

    partialResult.ad = adResult;

    return {
      validateOnly: false,
      adAccountId: context.adAccountId,
      campaign: campaignResult,
      adSet: {
        ...adSetResult,
        campaignId: null,
      },
      creative: creativeResult,
      ad: {
        ...adResult,
        adSetId: null,
        creativeId: null,
      },
    };
  } catch (error) {
    if (Object.keys(partialResult).length === 0) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unknown Meta Ads creation error.";

    const statusCode =
      error instanceof MetaAdsCampaignCreationError
        ? error.statusCode
        : 502;


    const originalErrorDetails =
      error instanceof MetaAdsCampaignCreationError
        ? error.details
        : null;

    throw new MetaAdsCampaignCreationError(
      `Meta Ads setup partially completed. Creation failed during ${failedStep}: ${message}`,
      statusCode,
      {
        failedStep,
        partialResult,
        originalError: message,
        originalErrorDetails,
      },
    );
  }
}
/**
 * Existing Meta resources already attached to the saved local campaign.
 * IDs in this object are reused; this resume flow never recreates them.
 */
export interface MetaAdsExistingResourceIds {
  adSetId?: string | null;
  creativeId?: string | null;
  adId?: string | null;
}

export interface ResumeMetaAdsCampaignOptions {
  /** Existing Meta Campaign ID. This method never creates a Campaign. */
  campaignId: string;
  /** IDs recovered from the local CampaignModel provider.resources array. */
  existingResourceIds?: MetaAdsExistingResourceIds;
  /**
   * Must be explicitly true before creating any missing child resource.
   * Set this only after reconciling the Meta account/Ads Manager and confirming
   * that the missing Ad Set, Creative and Ad do not already exist.
   */
  confirmMissingResources?: boolean;
}

export type MetaAdsCampaignResumeResult =
  MetaAdsCampaignBundleCreationResult & {
    resumed: true;
    reusedResources: Array<"campaign" | "adSet" | "creative" | "ad">;
  };

/**
 * Resume a partially-created Meta campaign without creating a second Campaign.
 * The caller must load the existing local campaign, pass its persisted provider
 * configuration and the Meta child IDs already saved in provider.resources.
 */
export async function resumeMetaAdsCampaignForUser(
  userId: string,
  selectedAccountId: string,
  input: CreateMetaAdsCampaignBundleInput,
  options: ResumeMetaAdsCampaignOptions,
): Promise<MetaAdsCampaignResumeResult> {
  const campaignId = options.campaignId?.trim();

  if (!campaignId || !/^\d+$/.test(campaignId)) {
    throw new MetaAdsCampaignCreationError(
      "A valid existing Meta Campaign ID is required to resume creation.",
      400,
    );
  }

  if (!input?.campaign || !input?.adSet || !input?.creative || !input?.ad) {
    throw new MetaAdsCampaignCreationError(
      "The saved Meta campaign, Ad Set, creative and ad configuration is required.",
      400,
    );
  }

  const existing = options.existingResourceIds ?? {};
  const existingAdSetId = existing.adSetId?.trim() || null;
  const existingCreativeId = existing.creativeId?.trim() || null;
  const existingAdId = existing.adId?.trim() || null;

  const missingResources = [
    ...(!existingAdSetId ? ["Ad Set"] : []),
    ...(!existingCreativeId ? ["Ad Creative"] : []),
    ...(!existingAdId ? ["Ad"] : []),
  ];

  if (missingResources.length > 0 && options.confirmMissingResources !== true) {
    throw new MetaAdsCampaignCreationError(
      `Retry has been blocked because these Meta resources have no saved IDs: ${missingResources.join(", ")}. Check the Meta account first, then explicitly confirm that the missing resources do not already exist.`,
      409,
      {
        requiresResourceReconciliation: true,
        existingCampaignId: campaignId,
        missingResources,
      },
    );
  }

  const context = await getMetaAdsCreationContext(
    userId,
    selectedAccountId,
  );

  const budgetLevel = input.campaign.budgetLevel ?? "CAMPAIGN";

  if (
    input.adSet.budgetLevel !== undefined &&
    input.adSet.budgetLevel !== budgetLevel
  ) {
    throw new MetaAdsCampaignCreationError(
      "Campaign and Ad Set budget levels do not match.",
      400,
    );
  }

  if (input.adSet.campaignObjective !== input.campaign.objective) {
    throw new MetaAdsCampaignCreationError(
      "Campaign objective and Ad Set campaignObjective must match.",
      400,
    );
  }

  const campaignResult: MetaAdsCampaignCreationResult = {
    validateOnly: false,
    adAccountId: context.adAccountId,
    campaignId,
    name: input.campaign.name,
    objective: input.campaign.objective,
    status: "PAUSED",
    buyingType: input.campaign.buyingType ?? "AUCTION",
    // This campaign was created in the earlier attempt; no create call is made.
    metaResponse: null,
  };

  const partialResult: {
    campaign?: MetaAdsCampaignCreationResult;
    adSet?: MetaAdsAdSetCreationResult;
    creative?: MetaAdsAdCreativeCreationResult;
    ad?: MetaAdsAdCreationResult;
  } = { campaign: campaignResult };

  const reusedResources: Array<"campaign" | "adSet" | "creative" | "ad"> = [
    "campaign",
  ];

  let failedStep = "Ad Set";

  try {
    let adSetResult: MetaAdsAdSetCreationResult;

    if (existingAdSetId) {
      reusedResources.push("adSet");
      adSetResult = {
        validateOnly: false,
        adAccountId: context.adAccountId,
        campaignId,
        adSetId: existingAdSetId,
        name: input.adSet.name,
        status: "PAUSED",
        metaResponse: null,
      };
    } else {
      adSetResult = await createMetaAdsAdSet(context, {
        ...input.adSet,
        campaignId,
        campaignObjective: input.campaign.objective,
        budgetLevel,
        specialAdCategories: input.campaign.specialAdCategories ?? [],
        validateOnly: false,
        confirm: true,
      });

      if (!adSetResult.adSetId) {
        throw new MetaAdsCampaignCreationError(
          "Meta Ads returned no Ad Set ID while resuming the campaign.",
          502,
          adSetResult.metaResponse,
        );
      }
    }

    partialResult.adSet = adSetResult;

    let creativeResult: MetaAdsAdCreativeCreationResult;
    failedStep = "Creative";

    if (existingCreativeId) {
      reusedResources.push("creative");
      creativeResult = {
        validateOnly: false,
        adAccountId: context.adAccountId,
        creativeId: existingCreativeId,
        name: input.creative.name,
        pageId: input.creative.pageId,
        metaResponse: null,
      };
    } else {
      creativeResult = await createMetaAdsAdCreative(context, {
        ...input.creative,
        validateOnly: false,
        confirm: true,
      });

      if (!creativeResult.creativeId) {
        throw new MetaAdsCampaignCreationError(
          "Meta Ads returned no Ad Creative ID while resuming the campaign.",
          502,
          creativeResult.metaResponse,
        );
      }
    }

    partialResult.creative = creativeResult;

    let adResult: MetaAdsAdCreationResult;
    failedStep = "Ad";

    if (existingAdId) {
      reusedResources.push("ad");
      adResult = {
        validateOnly: false,
        adAccountId: context.adAccountId,
        adId: existingAdId,
        adSetId: adSetResult.adSetId!,
        creativeId: creativeResult.creativeId!,
        name: input.ad.name,
        status: "PAUSED",
        metaResponse: null,
      };
    } else {
      adResult = await createMetaAdsAd(context, {
        ...input.ad,
        adSetId: adSetResult.adSetId!,
        creativeId: creativeResult.creativeId!,
        validateOnly: false,
        confirm: true,
      });

      if (!adResult.adId) {
        throw new MetaAdsCampaignCreationError(
          "Meta Ads returned no Ad ID while resuming the campaign.",
          502,
          adResult.metaResponse,
        );
      }
    }

    partialResult.ad = adResult;

    return {
      validateOnly: false,
      adAccountId: context.adAccountId,
      campaign: campaignResult,
      adSet: adSetResult,
      creative: creativeResult,
      ad: adResult,
      resumed: true,
      reusedResources,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Meta Ads resume error.";

    const statusCode =
      error instanceof MetaAdsCampaignCreationError
        ? error.statusCode
        : 502;

    const originalErrorDetails =
      error instanceof MetaAdsCampaignCreationError
        ? error.details ?? null
        : null;

    throw new MetaAdsCampaignCreationError(
      `Meta Ads resume failed during ${failedStep}: ${message}`,
      statusCode,
      {
        failedStep,
        resumed: true,
        partialResult,
        originalError: message,
        originalErrorDetails,
      },
    );
  }
}

