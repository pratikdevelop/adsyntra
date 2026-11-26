import { getAccessiblePageAccessToken } from "./meta-instant-form-lookups.service.js";
import { listMetaInstantFormsForPage } from "./meta-instant-form-lookups.service.js";
import { listMetaMessagingDestinationsForPage } from "./meta-messaging-destination-lookups.service.js";
import { listMetaAdvertisableApplications } from "./meta-advertisable-application-lookups.service.js";
import { listMetaPixelsForAdAccount } from "./meta-pixel-resource-lookups.service.js";
import { listMetaCustomConversionsForPixel } from "./meta-custom-conversion-lookups.service.js";
import { META_SPECIAL_AD_CATEGORY_COUNTRY_CODES } from "./meta-special-ad-category.constants.js";

type JsonRecord = Record<string, unknown>;

const META_SPECIAL_AD_CATEGORIES = new Set([
  "credit",
  "employment",
  "housing",
  "issues_elections_politics",
  "financial_products_services",
  "online_gambling_and_gaming",
  "none",
]);

const META_RESTRICTED_AUDIENCE_CATEGORIES = new Set([
  "credit",
  "employment",
  "housing",
  "financial_products_services",
]);

const META_PLACEMENT_ALLOWLIST: Record<string, Set<string>> = {
  facebook: new Set([
    "feed",
    "story",
    "video_feeds",
    "right_hand_column",
    "marketplace",
    "instream_video",
    "facebook_reels",
  ]),
  instagram: new Set([
    "stream",
    "story",
    "reels",
    "ig_search",
    "explore_home",
  ]),
  messenger: new Set(["messenger_home", "sponsored_messages"]),
  audience_network: new Set(["classic", "instream_video", "rewarded_video"]),
};




const META_STANDARD_EVENT_TYPES = new Set([
  "PURCHASE",
  "LEAD",
  "COMPLETE_REGISTRATION",
  "ADD_TO_CART",
  "ADD_TO_WISHLIST",
  "INITIATED_CHECKOUT",
  "ADD_PAYMENT_INFO",
  "CONTENT_VIEW",
  "SEARCH",
  "CONTACT",
  "CUSTOMIZE_PRODUCT",
  "DONATE",
  "FIND_LOCATION",
  "SCHEDULE",
  "START_TRIAL",
  "SUBMIT_APPLICATION",
  "SUBSCRIBE",
  "OTHER",
]);

export class MetaCampaignPrerequisiteError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "MetaCampaignPrerequisiteError";
    this.statusCode = statusCode;
  }
}

function getLookupStatusCode(error: unknown): number {
  const record = asRecord(error);
  const statusCode = record?.statusCode;

  if (typeof statusCode === "number" && statusCode >= 400 && statusCode <= 599) {
    // A lookup's generic 500 usually means the upstream provider could not be
    // reached or returned an unusable response. Surface that as a gateway error.
    return statusCode === 500 ? 502 : statusCode;
  }

  return 502;
}

async function runMetaLookup<T>(
  operation: () => Promise<T>,
  fallbackMessage: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof MetaCampaignPrerequisiteError) {
      throw error;
    }

    throw new MetaCampaignPrerequisiteError(
      error instanceof Error && error.message.trim()
        ? error.message
        : fallbackMessage,
      getLookupStatusCode(error),
    );
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function readRecord(record: JsonRecord | null, ...keys: string[]): JsonRecord | null {
  if (!record) return null;
  for (const key of keys) {
    const result = asRecord(record[key]);
    if (result) return result;
  }
  return null;
}

function readString(record: JsonRecord | null, ...keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function readStringArray(record: JsonRecord | null, ...keys: string[]): string[] {
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    }
  }
  return [];
}

function normalizeMetaAccountId(value: string): string {
  return value.trim().replace(/^act_/i, "");
}

function requireNumericId(value: string, label: string): string {
  if (!/^\d+$/.test(value)) {
    throw new MetaCampaignPrerequisiteError(`${label} must be selected from the connected Meta account resources.`);
  }
  return value;
}

async function findAccountPixel(
  userId: string,
  accountId: string,
  pixelId: string,
) {
  let cursor: string | undefined;
  const seen = new Set<string>();

  for (let page = 0; page < 25; page += 1) {
    const result = await listMetaPixelsForAdAccount(userId, accountId, cursor);
    const match = result.pixels.find((pixel) => pixel.id === pixelId);
    if (match) {
      if (match.isUnavailable) {
        throw new MetaCampaignPrerequisiteError("The selected Meta Pixel/Dataset is unavailable for this Ad Account.");
      }
      return match;
    }

    const next = result.pagination.nextCursor;
    if (!result.pagination.hasNextPage || !next || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }

  throw new MetaCampaignPrerequisiteError("The selected Meta Pixel/Dataset is not accessible from the selected Meta Ad Account. Select a resource returned for this account.");
}

async function findCustomConversion(
  userId: string,
  accountId: string,
  pixelId: string,
  customConversionId: string,
) {
  let cursor: string | undefined;
  const seen = new Set<string>();

  for (let page = 0; page < 25; page += 1) {
    const result = await listMetaCustomConversionsForPixel(
      userId,
      accountId,
      pixelId,
      cursor,
    );
    const match = result.customConversions.find((conversion) =>
      conversion.id === customConversionId &&
      conversion.sourcePixelIds.includes(pixelId),
    );

    if (match) {
      if (match.isArchived || match.isUnavailable) {
        throw new MetaCampaignPrerequisiteError("The selected Meta Custom Conversion is archived or unavailable.");
      }
      return match;
    }

    const next = result.pagination.nextCursor;
    if (!result.pagination.hasNextPage || !next || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }

  throw new MetaCampaignPrerequisiteError("The selected Custom Conversion does not belong to the selected Pixel/Dataset and Ad Account.");
}

async function findInstantForm(userId: string, pageId: string, formId: string) {
  let cursor: string | undefined;
  const seen = new Set<string>();

  for (let page = 0; page < 25; page += 1) {
    const result = await listMetaInstantFormsForPage(userId, pageId, cursor);
    const match = result.forms.find((form) => form.id === formId);
    if (match) {
      if (match.isArchived || match.isUnavailable || match.status === "ARCHIVED") {
        throw new MetaCampaignPrerequisiteError("The selected Meta Instant Form is archived or unavailable.");
      }
      return match;
    }

    const next = result.pagination.nextCursor;
    if (!result.pagination.hasNextPage || !next || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }

  throw new MetaCampaignPrerequisiteError("The selected Instant Form is not available under the selected Facebook Page.");
}

async function findAdvertisableApplication(
  userId: string,
  accountId: string,
  appId: string,
) {
  let cursor: string | undefined;
  const seen = new Set<string>();

  for (let page = 0; page < 25; page += 1) {
    const result = await listMetaAdvertisableApplications(userId, accountId, cursor);
    const match = result.applications.find((app) => app.id === appId);
    if (match) return match;

    const next = result.pagination.nextCursor;
    if (!result.pagination.hasNextPage || !next || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }

  throw new MetaCampaignPrerequisiteError("The selected app is not available to the selected Meta Ad Account. Choose an advertisable app returned by the account lookup.");
}

function hasOwn(record: JsonRecord | null, key: string): boolean {
  return Boolean(record && Object.prototype.hasOwnProperty.call(record, key));
}

function readArrayLength(record: JsonRecord | null, ...keys: string[]): number {
  if (!record) return 0;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.length;
  }
  return 0;
}

function validateMetaSpecialCategoryAndTargeting(
  campaign: JsonRecord | null,
  targeting: JsonRecord | null,
): string[] {
  const categoryFieldName = campaign && hasOwn(campaign, "special_ad_categories")
    ? "special_ad_categories"
    : "specialAdCategories";
  const rawCategories = campaign?.[categoryFieldName];
  if (!Array.isArray(rawCategories) || rawCategories.some((item) => typeof item !== "string")) {
    throw new MetaCampaignPrerequisiteError(
      "Every Meta campaign must declare special_ad_categories as an array. Send an empty array when no Special Ad Category applies.",
    );
  }
  const categories = rawCategories.map((item) => item.trim().toLowerCase()).filter(Boolean);
  const categorySet = new Set(categories);

  const unknownCategories = categories.filter(
    (category) => !META_SPECIAL_AD_CATEGORIES.has(category),
  );
  if (unknownCategories.length) {
    throw new MetaCampaignPrerequisiteError(
      `Unsupported Meta Special Ad Category value(s): ${unknownCategories.join(", ")}. Refresh the category selection and use supported API values.`,
    );
  }
  if (categorySet.size !== categories.length) {
    throw new MetaCampaignPrerequisiteError("A Meta Special Ad Category cannot be selected more than once.");
  }
  if (categorySet.has("none") && categorySet.size > 1) {
    throw new MetaCampaignPrerequisiteError("Meta category NONE cannot be combined with another Special Ad Category.");
  }

  const countryFieldName = campaign && hasOwn(campaign, "special_ad_category_country")
    ? "special_ad_category_country"
    : "specialAdCategoryCountries";
  const rawCategoryCountries = campaign?.[countryFieldName];
  const categoryCountries = Array.isArray(rawCategoryCountries)
    ? rawCategoryCountries
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    : [];
  if (rawCategoryCountries !== undefined &&
      (!Array.isArray(rawCategoryCountries) ||
       rawCategoryCountries.some((item) => typeof item !== "string"))) {
    throw new MetaCampaignPrerequisiteError("Meta special_ad_category_country must be an array of ISO country codes.");
  }
  if (categories.length > 0 && categoryCountries.length === 0) {
    throw new MetaCampaignPrerequisiteError("A Meta Special Ad Category requires at least one special_ad_category_country. Select the included country or countries where this ad will run.");
  }
  if (categories.length === 0 && categoryCountries.length > 0) {
    throw new MetaCampaignPrerequisiteError("special_ad_category_country must be omitted when no Meta Special Ad Category is selected.");
  }
  if (new Set(categoryCountries).size !== categoryCountries.length) {
    throw new MetaCampaignPrerequisiteError("A Meta Special Ad Category country cannot be selected more than once.");
  }
  const unsupportedCountries = categoryCountries.filter(
    (country) => !META_SPECIAL_AD_CATEGORY_COUNTRY_CODES.has(country),
  );
  if (unsupportedCountries.length) {
    throw new MetaCampaignPrerequisiteError(
      `Unsupported Meta Special Ad Category country code(s): ${unsupportedCountries.join(", ")}. Use a country code supported by the Meta Marketing API.`,
    );
  }
  const includedGeo = readRecord(targeting, "geo_locations", "geoLocations");
  const includedCountries = readStringArray(includedGeo, "countries");
  if (includedCountries.length > 0) {
    const includedCountrySet = new Set(includedCountries.map((country) => country.toUpperCase()));
    const countriesOutsideTargeting = categoryCountries.filter(
      (country) => !includedCountrySet.has(country),
    );
    if (countriesOutsideTargeting.length) {
      throw new MetaCampaignPrerequisiteError(
        `Special Ad Category country value(s) must also be included in the campaign's geo_locations.countries targeting: ${countriesOutsideTargeting.join(", ")}.`,
      );
    }
  }

  const restrictedCategories = categories.filter((category) =>
    META_RESTRICTED_AUDIENCE_CATEGORIES.has(category),
  );
  if (restrictedCategories.length && targeting) {
    const hasAgeOrGender = ["age_min", "age_max", "genders", "ageMin", "ageMax"]
      .some((key) => hasOwn(targeting, key));
    const hasDetailedTargeting = readArrayLength(targeting, "flexible_spec", "flexibleSpec") > 0;

    if (hasAgeOrGender || hasDetailedTargeting) {
      throw new MetaCampaignPrerequisiteError(
        "Meta Housing, Employment, Credit and Financial Products & Services campaigns cannot use the submitted age, gender or detailed-interest targeting fields. Remove those fields and use the restricted-category audience controls.",
      );
    }
  }

  return restrictedCategories;
}

function validateMetaManualPlacements(
  targeting: JsonRecord | null,
  objective: string,
  optimizationGoal: string,
  destinationType: string,
  messagingType: string,
): void {
  if (!targeting || (!hasOwn(targeting, "publisher_platforms") && !hasOwn(targeting, "publisherPlatforms"))) {
    return; // No manual publisher list means AdSyntra's automatic placement path.
  }

  const platformFieldName = hasOwn(targeting, "publisher_platforms")
    ? "publisher_platforms"
    : "publisherPlatforms";
  const rawPlatforms = targeting[platformFieldName];
  if (!Array.isArray(rawPlatforms) || rawPlatforms.some((item) => typeof item !== "string")) {
    throw new MetaCampaignPrerequisiteError("Manual Meta publisher platforms must be supplied as an array of supported strings.");
  }
  const platforms = rawPlatforms.map((platform) => platform.trim().toLowerCase()).filter(Boolean);
  if (!platforms.length) {
    throw new MetaCampaignPrerequisiteError("Manual Meta placements require at least one publisher platform.");
  }
  const duplicatePlatforms = platforms.filter((platform, index) => platforms.indexOf(platform) !== index);
  if (duplicatePlatforms.length) {
    throw new MetaCampaignPrerequisiteError("A Meta publisher platform cannot be selected more than once.");
  }

  const knownPlatforms = new Set(Object.keys(META_PLACEMENT_ALLOWLIST));
  const unknownPlatforms = platforms.filter((platform) => !knownPlatforms.has(platform));
  if (unknownPlatforms.length) {
    throw new MetaCampaignPrerequisiteError(
      `Unsupported Meta publisher platform(s): ${unknownPlatforms.join(", ")}. WhatsApp placement is not enabled in the current AdSyntra creative flow.`,
    );
  }

  const fieldByPlatform: Record<string, string[]> = {
    facebook: ["facebook_positions", "facebookPositions"],
    instagram: ["instagram_positions", "instagramPositions"],
    messenger: ["messenger_positions", "messengerPositions"],
    audience_network: ["audience_network_positions", "audienceNetworkPositions"],
  };

  const selectedPositions: Record<string, string[]> = {};
  for (const [platform, keys] of Object.entries(fieldByPlatform)) {
    const positionFieldName = keys.find((key) => hasOwn(targeting, key));
    const rawPositions = positionFieldName ? targeting[positionFieldName] : undefined;
    if (rawPositions !== undefined && (!Array.isArray(rawPositions) || rawPositions.some((item) => typeof item !== "string"))) {
      throw new MetaCampaignPrerequisiteError(`Meta ${platform.replace(/_/g, " ")} placement values must be supplied as an array of supported strings.`);
    }
    const positions = Array.isArray(rawPositions)
      ? rawPositions.map((position) => position.trim().toLowerCase()).filter(Boolean)
      : [];
    selectedPositions[platform] = positions;

    if (platforms.includes(platform) && positions.length === 0) {
      throw new MetaCampaignPrerequisiteError(`Select at least one supported ${platform.replace(/_/g, " ")} placement.`);
    }
    if (!platforms.includes(platform) && positions.length > 0) {
      throw new MetaCampaignPrerequisiteError(`Meta ${platform.replace(/_/g, " ")} placements were provided, but that publisher platform is not selected.`);
    }

    if (new Set(positions).size !== positions.length) {
      throw new MetaCampaignPrerequisiteError(`A ${platform.replace(/_/g, " ")} placement cannot be selected more than once.`);
    }
    const allowlist = META_PLACEMENT_ALLOWLIST[platform];
    const invalid = positions.filter((position) => !allowlist.has(position));
    if (invalid.length) {
      const extra = platform === "instagram" && invalid.includes("explore")
        ? " The legacy Instagram Explore placement is unavailable in the configured Meta Graph API version."
        : platform === "messenger" && invalid.includes("story")
          ? " Messenger Stories are not available in the configured Meta Graph API version."
          : "";
      throw new MetaCampaignPrerequisiteError(
        `Unsupported ${platform.replace(/_/g, " ")} placement value(s): ${invalid.join(", ")}.${extra}`,
      );
    }
  }

  const placementPolicies: Array<{
    applies: boolean;
    allowedPlatforms: Set<string>;
    allowedPositions: Record<string, Set<string>>;
    label: string;
  }> = [
    {
      applies: objective === "OUTCOME_AWARENESS",
      allowedPlatforms: new Set(["facebook", "instagram", "audience_network"]),
      allowedPositions: {
        facebook: new Set(["feed", "video_feeds", "instream_video", "story"]),
        instagram: new Set(["stream"]),
        audience_network: new Set(["classic", "instream_video"]),
      },
      label: "Meta Awareness",
    },
    {
      applies: objective === "OUTCOME_LEADS" &&
        optimizationGoal === "LEAD_GENERATION" &&
        destinationType === "INSTANT_FORM",
      allowedPlatforms: new Set(["facebook", "instagram"]),
      allowedPositions: {
        facebook: new Set(["feed", "story"]),
        instagram: new Set(["stream"]),
      },
      label: "Meta Instant Form lead generation",
    },
    {
      applies: objective === "OUTCOME_APP_PROMOTION" &&
        optimizationGoal === "APP_INSTALLS" &&
        destinationType === "APP",
      allowedPlatforms: new Set(["facebook", "instagram", "audience_network"]),
      allowedPositions: {},
      label: "Meta App Install",
    },
  ];

  for (const policy of placementPolicies.filter((item) => item.applies)) {
    const unsupportedPlatforms = platforms.filter(
      (platform) => !policy.allowedPlatforms.has(platform),
    );
    if (unsupportedPlatforms.length) {
      throw new MetaCampaignPrerequisiteError(
        `${policy.label} does not support the selected manual publisher platform(s): ${unsupportedPlatforms.join(", ")}.`,
      );
    }
    for (const [platform, allowedPositions] of Object.entries(policy.allowedPositions)) {
      const unsupportedPositions = (selectedPositions[platform] || []).filter(
        (position) => !allowedPositions.has(position),
      );
      if (unsupportedPositions.length) {
        throw new MetaCampaignPrerequisiteError(
          `${policy.label} does not support the selected ${platform.replace(/_/g, " ")} placement(s): ${unsupportedPositions.join(", ")}.`,
        );
      }
    }
  }

  const isTrafficObjective = ["OUTCOME_TRAFFIC", "LINK_CLICKS"].includes(objective);
  if (isTrafficObjective && destinationType === "MESSAGING") {
    if (
      messagingType === "MESSENGER" &&
      selectedPositions.facebook?.includes("story")
    ) {
      throw new MetaCampaignPrerequisiteError(
        "Facebook Stories is not compatible with the selected Messenger destination for this traffic objective. Remove Facebook Stories or choose a compatible destination.",
      );
    }
    if (
      ["MESSENGER", "WHATSAPP"].includes(messagingType) &&
      (selectedPositions.instagram?.includes("ig_search") ||
        selectedPositions.instagram?.includes("explore_home"))
    ) {
      throw new MetaCampaignPrerequisiteError(
        "Instagram Search and Explore Home placements are not compatible with the selected Messenger or WhatsApp destination for this traffic objective.",
      );
    }
  }
}

/**
 * Server-side, account-scoped checks for the provider resources referenced by
 * the Meta campaign builder. Resource existence is checked independently from
 * Pixel event activity; this function does not assert that website events are
 * firing or healthy.
 */
export async function validateMetaCampaignPrerequisites(
  userId: string,
  rawAccountId: string,
  configurationValue: unknown,
): Promise<void> {
  const accountId = normalizeMetaAccountId(rawAccountId);
  if (!/^\d+$/.test(accountId)) {
    throw new MetaCampaignPrerequisiteError("A valid Meta Ad Account must be selected.");
  }

  const configuration = asRecord(configurationValue);
  const campaign = readRecord(configuration, "campaign");
  const adSet = readRecord(configuration, "adSet", "ad_set");
  const targeting = readRecord(adSet, "targeting");
  validateMetaSpecialCategoryAndTargeting(campaign, targeting);
  const campaignObjective = readString(campaign, "objective").toUpperCase();
  const ad = readRecord(configuration, "ad");
  const creative = readRecord(configuration, "creative") ?? readRecord(ad, "creativeDraft", "creative_draft");
  const destination = readRecord(creative, "destination");
  const destinationType = readString(destination, "type").toUpperCase();
  const messagingType = readString(destination, "messagingType", "messaging_type").toUpperCase();
  validateMetaManualPlacements(
    targeting,
    campaignObjective,
    readString(adSet, "optimization_goal", "optimizationGoal").toUpperCase(),
    destinationType,
    messagingType,
  );
  const promotedObject = readRecord(adSet, "promoted_object", "promotedObject");
  const measurement = readRecord(configuration, "conversionMeasurement", "conversion_measurement");

  const pageId = requireNumericId(
    readString(creative, "pageId", "page_id"),
    "Facebook Page ID",
  );

  // Confirms that the Page belongs to the connected Meta identity and that
  // the identity has the ADVERTISE task where Meta supplies task information.
  await runMetaLookup(
    () => getAccessiblePageAccessToken(userId, pageId),
    "Unable to verify access to the selected Facebook Page.",
  );

  const publisherPlatforms = readStringArray(targeting, "publisher_platforms", "publisherPlatforms");
  const messagingDestinationId = readString(destination, "messagingDestinationId", "messaging_destination_id");
  const instagramActorId = readString(creative, "instagramActorId", "instagram_actor_id");

  // Special-category audience validation was applied before resource lookups;
  // other Meta category types deliberately do not inherit those restrictions.

  if (
    publisherPlatforms.includes("instagram") ||
    Boolean(instagramActorId) ||
    (destinationType === "MESSAGING" && messagingType === "INSTAGRAM_DIRECT")
  ) {
    const identity = await runMetaLookup(
      () => listMetaMessagingDestinationsForPage(userId, pageId),
      "Unable to verify the Instagram identity linked to the selected Facebook Page.",
    );
    const instagram = identity.destinations.find((item) => item.type === "INSTAGRAM_DIRECT" && item.isAvailable);
    if (!instagram?.id) {
      throw new MetaCampaignPrerequisiteError("Instagram placement or Instagram Direct messaging requires an eligible Instagram professional account linked to the selected Facebook Page.");
    }
    if (instagramActorId && instagramActorId !== instagram.id) {
      throw new MetaCampaignPrerequisiteError("The selected Instagram identity does not match the Instagram account linked to the selected Facebook Page.");
    }
  }

  if (destinationType === "INSTANT_FORM") {
    const formId = requireNumericId(
      readString(destination, "instantFormId", "instant_form_id"),
      "Meta Instant Form ID",
    );
    await runMetaLookup(
      () => findInstantForm(userId, pageId, formId),
      "Unable to verify the selected Instant Form under this Facebook Page.",
    );
  }

  if (destinationType === "MESSAGING") {
    if (!messagingType || !messagingDestinationId) {
      throw new MetaCampaignPrerequisiteError("Select an eligible messaging destination for the selected Facebook Page.");
    }
    const destinations = await runMetaLookup(
      () => listMetaMessagingDestinationsForPage(userId, pageId),
      "Unable to verify messaging destinations for this Facebook Page.",
    );
    const selected = destinations.destinations.find((item) =>
      item.type === messagingType &&
      item.id === messagingDestinationId &&
      item.isAvailable,
    );
    if (!selected) {
      throw new MetaCampaignPrerequisiteError("The selected messaging destination is no longer available for this Facebook Page. Refresh the destination list and select an available identity.");
    }
  }

  if (destinationType === "APP") {
    const appId = requireNumericId(
      readString(destination, "appId", "app_id"),
      "Meta App ID",
    );
    const appStoreUrl = readString(destination, "appStoreUrl", "app_store_url");
    if (!/^https:\/\//i.test(appStoreUrl)) {
      throw new MetaCampaignPrerequisiteError("A valid HTTPS App Store or Google Play destination URL is required for Meta app campaigns.");
    }
    await runMetaLookup(
      () => findAdvertisableApplication(userId, accountId, appId),
      "Unable to verify the selected application for this Meta Ad Account.",
    );
  }

  const optimizationGoal = readString(adSet, "optimization_goal", "optimizationGoal").toUpperCase();
  const pixelId = readString(measurement, "pixelId", "pixel_id") || readString(promotedObject, "pixel_id", "pixelId");
  const customConversionId = readString(measurement, "customConversionId", "custom_conversion_id") || readString(promotedObject, "custom_conversion_id", "customConversionId");
  const standardEvent = readString(measurement, "standardEvent", "standard_event") || readString(promotedObject, "custom_event_type", "customEventType");
  const websiteConversionRequired = destinationType === "WEBSITE" && ["OFFSITE_CONVERSIONS", "VALUE"].includes(optimizationGoal);

  if (websiteConversionRequired && !pixelId && !customConversionId) {
    throw new MetaCampaignPrerequisiteError("Website conversion optimization requires a Pixel/Dataset or an eligible Custom Conversion.");
  }

  if (pixelId) {
    requireNumericId(pixelId, "Meta Pixel/Dataset ID");
    await runMetaLookup(
      () => findAccountPixel(userId, accountId, pixelId),
      "Unable to verify the selected Pixel/Dataset for this Meta Ad Account.",
    );
  }

  if (customConversionId) {
    requireNumericId(customConversionId, "Meta Custom Conversion ID");
    if (!pixelId) {
      throw new MetaCampaignPrerequisiteError("A source Pixel/Dataset must accompany the selected Custom Conversion so AdSyntra can verify the conversion belongs to the selected account.");
    }
    await runMetaLookup(
      () => findCustomConversion(userId, accountId, pixelId, customConversionId),
      "Unable to verify the selected Custom Conversion for this Pixel/Dataset.",
    );
  } else if (websiteConversionRequired && pixelId) {
    if (!standardEvent || !META_STANDARD_EVENT_TYPES.has(standardEvent.toUpperCase())) {
      throw new MetaCampaignPrerequisiteError(
        "Select a supported standard conversion event for the selected Pixel/Dataset.",
      );
    }
  }
}
