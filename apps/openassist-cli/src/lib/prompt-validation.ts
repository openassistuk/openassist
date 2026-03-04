import net from "node:net";

interface InputPromptLike {
  input(message: string, initial?: string): Promise<string>;
}

interface SelectChoice<T extends string = string> {
  name: string;
  value: T;
}

interface SelectPromptLike {
  select<T extends string>(message: string, choices: SelectChoice<T>[], initial?: T): Promise<T>;
}

type TimezonePromptLike = InputPromptLike & Partial<SelectPromptLike>;

const UTC_ALIASES = new Set([
  "utc",
  "etc/utc",
  "etc/gmt",
  "etc/gmt0",
  "gmt",
  "z"
]);

let cachedCountryCityTimezones: string[] | null = null;
let cachedTimezoneRegions: string[] | null = null;

function isIntegerLike(value: string): boolean {
  return /^-?\d+$/.test(value.trim());
}

function isValidIdentifier(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
}

export function normalizeIdentifier(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/[-._]{2,}/g, "-");
  if (!normalized || !isValidIdentifier(normalized)) {
    return "";
  }
  return normalized;
}

function isValidHostname(value: string): boolean {
  if (value.length === 0 || value.length > 253) {
    return false;
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(value)) {
    return false;
  }
  if (value.startsWith(".") || value.endsWith(".")) {
    return false;
  }
  if (value.includes("..")) {
    return false;
  }
  return value.split(".").every((part) => {
    if (part.length === 0 || part.length > 63) {
      return false;
    }
    return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part);
  });
}

export function isValidIanaTimezone(value: string): boolean {
  try {
    // Throws RangeError for invalid timezone names.
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function isCountryCityTimezone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes("/")) {
    return false;
  }
  if (trimmed.toLowerCase().startsWith("etc/")) {
    return false;
  }
  return isValidIanaTimezone(trimmed);
}

function listCountryCityTimezones(): string[] {
  if (cachedCountryCityTimezones) {
    return cachedCountryCityTimezones;
  }

  let supported: string[] = [];
  try {
    const maybeValues = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf?.("timeZone");
    if (Array.isArray(maybeValues)) {
      supported = maybeValues;
    }
  } catch {
    supported = [];
  }

  if (supported.length === 0) {
    supported = [
      "Europe/London",
      "Europe/Paris",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "Australia/Sydney",
      "Asia/Tokyo",
      "Asia/Singapore"
    ];
  }

  cachedCountryCityTimezones = supported.filter((timezone) => isCountryCityTimezone(timezone));
  return cachedCountryCityTimezones;
}

function listTimezoneRegions(): string[] {
  if (cachedTimezoneRegions) {
    return cachedTimezoneRegions;
  }
  const regions = new Set<string>();
  for (const timezone of listCountryCityTimezones()) {
    const firstSegment = timezone.split("/", 1)[0];
    if (firstSegment.length > 0) {
      regions.add(firstSegment);
    }
  }
  cachedTimezoneRegions = Array.from(regions).sort((a, b) => a.localeCompare(b));
  return cachedTimezoneRegions;
}

function listRegionTimezones(region: string): string[] {
  return listCountryCityTimezones().filter((timezone) => timezone.startsWith(`${region}/`));
}

function canonicalCountryCityTimezone(value: string): string | null {
  const lowered = value.trim().toLowerCase();
  if (!lowered) {
    return null;
  }

  const match = listCountryCityTimezones().find((candidate) => candidate.toLowerCase() === lowered);
  if (match) {
    return match;
  }

  if (isCountryCityTimezone(value)) {
    return value.trim();
  }

  return null;
}

function searchCountryCityTimezones(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const results = listCountryCityTimezones().filter((timezone) => {
    const full = timezone.toLowerCase();
    if (full.includes(normalized)) {
      return true;
    }

    const city = timezone.split("/").slice(1).join("/").replace(/_/g, " ").toLowerCase();
    return city.includes(normalized);
  });

  return results.slice(0, 8);
}

function buildTimezoneInputHint(message: string): string {
  return `${message} (Country/City, e.g. America/New_York; city name also works)`;
}

function isSelectPromptLike(prompts: TimezonePromptLike): prompts is InputPromptLike & SelectPromptLike {
  return typeof (prompts as SelectPromptLike).select === "function";
}

function timezoneChoiceLabel(timezone: string): string {
  const cityPath = timezone.split("/").slice(1).join("/");
  const cityName = cityPath.replace(/_/g, " ");
  return `${cityName} (${timezone})`;
}

function resolveTimezoneFromRegionSelection(value: string): { region?: string; timezone?: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }
  const directTimezone = resolveCountryCityTimezone(trimmed);
  if (directTimezone) {
    return { timezone: directTimezone };
  }
  if (trimmed.includes("/")) {
    return {};
  }
  const regions = listTimezoneRegions();
  const exactRegion = regions.find((region) => region.toLowerCase() === trimmed.toLowerCase());
  if (exactRegion) {
    return { region: exactRegion };
  }
  return {};
}

function resolveTimezoneFromCitySelection(region: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const directTimezone = resolveCountryCityTimezone(trimmed);
  if (directTimezone && directTimezone.startsWith(`${region}/`)) {
    return directTimezone;
  }

  const normalized = trimmed.toLowerCase().replace(/_/g, " ");
  const matches = listRegionTimezones(region).filter((timezone) => {
    const city = timezone.split("/").slice(1).join("/").replace(/_/g, " ").toLowerCase();
    const full = timezone.toLowerCase();
    return city === normalized || city.includes(normalized) || full === normalized;
  });
  if (matches.length === 1) {
    return matches[0];
  }
  return null;
}

async function selectTimezoneFromRegion(
  prompts: SelectPromptLike,
  message: string,
  region: string,
  initialTimezone?: string
): Promise<{ timezone?: string; hasChoices: boolean }> {
  const cityChoices = listRegionTimezones(region).map((timezone) => ({
    name: timezoneChoiceLabel(timezone),
    value: timezone
  }));
  if (cityChoices.length === 0) {
    return { hasChoices: false };
  }

  const initialCity =
    initialTimezone && initialTimezone.startsWith(`${region}/`) ? initialTimezone : cityChoices[0]?.value;
  const citySelection = await prompts.select(`${message} - city`, cityChoices, initialCity);
  return {
    hasChoices: true,
    timezone: resolveTimezoneFromCitySelection(region, citySelection) ?? undefined
  };
}

function describeTimezoneDsts(timezone: string): string {
  const year = new Date().getUTCFullYear();
  const jan = new Date(Date.UTC(year, 0, 1));
  const jul = new Date(Date.UTC(year, 6, 1));
  const janText = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset"
  })
    .formatToParts(jan)
    .find((part) => part.type === "timeZoneName")?.value;
  const julText = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset"
  })
    .formatToParts(jul)
    .find((part) => part.type === "timeZoneName")?.value;

  const observesDst = janText !== julText;
  return observesDst ? "DST aware: yes" : "DST aware: no seasonal shift";
}

function resolveCountryCityTimezone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (UTC_ALIASES.has(trimmed.toLowerCase())) {
    return null;
  }

  const canonical = canonicalCountryCityTimezone(trimmed);
  if (canonical) {
    return canonical;
  }

  const matches = searchCountryCityTimezones(trimmed);
  if (matches.length === 1) {
    return matches[0];
  }
  return null;
}

export function isValidBindAddress(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) {
    return false;
  }
  if (candidate === "localhost" || candidate === "0.0.0.0" || candidate === "::") {
    return true;
  }
  if (net.isIP(candidate) !== 0) {
    return true;
  }
  return isValidHostname(candidate);
}

export async function promptRequiredText(
  prompts: InputPromptLike,
  message: string,
  initial = ""
): Promise<string> {
  while (true) {
    const value = (await prompts.input(message, initial)).trim();
    if (value.length > 0) {
      return value;
    }
    console.error("Value is required.");
  }
}

export async function promptIdentifier(
  prompts: InputPromptLike,
  message: string,
  initial = ""
): Promise<string> {
  while (true) {
    const value = (await prompts.input(message, initial)).trim();
    if (!value) {
      console.error("Identifier is required.");
      continue;
    }
    if (!isValidIdentifier(value)) {
      console.error("Identifier must match [a-zA-Z0-9][a-zA-Z0-9._-]* with no spaces.");
      continue;
    }
    return value;
  }
}

export async function promptGeneratedIdentifier(
  prompts: InputPromptLike,
  message: string,
  initial = ""
): Promise<string> {
  while (true) {
    const value = (await prompts.input(message, initial)).trim();
    if (!value) {
      console.error("Value is required.");
      continue;
    }
    const id = normalizeIdentifier(value);
    if (!id) {
      console.error(
        "Could not generate a valid internal ID from that value. Use letters/numbers and simple separators."
      );
      continue;
    }
    return id;
  }
}

export async function promptInteger(
  prompts: InputPromptLike,
  message: string,
  initial: number,
  options: {
    min?: number;
    max?: number;
  } = {}
): Promise<number> {
  while (true) {
    const raw = await prompts.input(message, String(initial));
    const trimmed = raw.trim();
    if (!trimmed) {
      return initial;
    }
    if (!isIntegerLike(trimmed)) {
      console.error("Enter a whole number.");
      continue;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (options.min !== undefined && parsed < options.min) {
      console.error(`Value must be >= ${options.min}.`);
      continue;
    }
    if (options.max !== undefined && parsed > options.max) {
      console.error(`Value must be <= ${options.max}.`);
      continue;
    }
    return parsed;
  }
}

export async function promptOptionalInteger(
  prompts: InputPromptLike,
  message: string,
  options: {
    min?: number;
    max?: number;
  } = {}
): Promise<number | undefined> {
  while (true) {
    const raw = await prompts.input(message, "");
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    if (!isIntegerLike(trimmed)) {
      console.error("Enter a whole number or leave blank.");
      continue;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (options.min !== undefined && parsed < options.min) {
      console.error(`Value must be >= ${options.min}.`);
      continue;
    }
    if (options.max !== undefined && parsed > options.max) {
      console.error(`Value must be <= ${options.max}.`);
      continue;
    }
    return parsed;
  }
}

export async function promptBindAddress(
  prompts: InputPromptLike,
  message: string,
  initial: string
): Promise<string> {
  while (true) {
    const value = (await prompts.input(message, initial)).trim();
    if (isValidBindAddress(value)) {
      return value;
    }
    console.error("Bind address must be a valid IP/hostname (for example 127.0.0.1, 0.0.0.0, localhost).");
  }
}

export async function promptTimezone(
  prompts: TimezonePromptLike,
  message: string,
  initial: string
): Promise<string> {
  if (isSelectPromptLike(prompts)) {
    const initialTimezone = resolveCountryCityTimezone(initial);
    const regionChoices = listTimezoneRegions().map((region) => ({
      name: region,
      value: region
    }));

    while (true) {
      const initialRegion = initialTimezone?.split("/", 1)[0] ?? regionChoices[0]?.value;
      const regionSelection = await prompts.select(
        `${message} - country/region`,
        regionChoices,
        initialRegion
      );
      const regionResolved = resolveTimezoneFromRegionSelection(regionSelection);
      if (regionResolved.timezone) {
        console.log(describeTimezoneDsts(regionResolved.timezone));
        return regionResolved.timezone;
      }
      if (!regionResolved.region) {
        console.error("Select a valid country/region from the list.");
        continue;
      }

      const citySelection = await selectTimezoneFromRegion(
        prompts,
        message,
        regionResolved.region,
        initialTimezone ?? undefined
      );
      if (!citySelection.hasChoices) {
        console.error("No city timezones are available for that country/region.");
        continue;
      }
      if (!citySelection.timezone) {
        console.error("Select a valid city/timezone from the list.");
        continue;
      }
      console.log(describeTimezoneDsts(citySelection.timezone));
      return citySelection.timezone;
    }
  }

  const promptMessage = buildTimezoneInputHint(message);
  while (true) {
    const value = (await prompts.input(promptMessage, initial)).trim();
    if (!value) {
      console.error("Timezone is required.");
      continue;
    }

    const resolved = resolveCountryCityTimezone(value);
    if (resolved) {
      if (resolved.toLowerCase() !== value.toLowerCase()) {
        console.log(`Using timezone ${resolved}.`);
      }
      console.log(describeTimezoneDsts(resolved));
      return resolved;
    }

    if (UTC_ALIASES.has(value.toLowerCase())) {
      console.error(
        "Use a Country/City timezone (for example America/New_York). UTC aliases are not accepted in setup prompts."
      );
      continue;
    }

    const matches = searchCountryCityTimezones(value);
    if (matches.length > 0) {
      console.error(
        `Timezone must be Country/City. Try one of: ${matches.join(", ")}`
      );
      continue;
    }

    console.error(
      "Timezone must be a valid Country/City timezone (for example America/New_York or Europe/London)."
    );
  }
}

export async function promptOptionalTimezone(
  prompts: TimezonePromptLike,
  message: string,
  initial = ""
): Promise<string | undefined> {
  if (isSelectPromptLike(prompts)) {
    const initialTimezone = resolveCountryCityTimezone(initial);
    const mode = await prompts.select<string>(
      `${message} - override mode`,
      [
        { name: "Use runtime default (no override)", value: "__none__" },
        { name: "Choose country/region and city", value: "__pick__" }
      ],
      initialTimezone ? "__pick__" : "__none__"
    );
    if (mode === "__none__" || mode.trim() === "") {
      return undefined;
    }
    if (mode !== "__pick__") {
      const directTimezone = resolveCountryCityTimezone(mode);
      if (directTimezone) {
        console.log(describeTimezoneDsts(directTimezone));
        return directTimezone;
      }
      const regionResolved = resolveTimezoneFromRegionSelection(mode);
      if (regionResolved.timezone) {
        console.log(describeTimezoneDsts(regionResolved.timezone));
        return regionResolved.timezone;
      }
      if (regionResolved.region) {
        const citySelection = await selectTimezoneFromRegion(
          prompts,
          message,
          regionResolved.region,
          initialTimezone ?? ""
        );
        if (citySelection.timezone) {
          console.log(describeTimezoneDsts(citySelection.timezone));
          return citySelection.timezone;
        }
      }
    }
    return promptTimezone(prompts, message, initialTimezone ?? initial);
  }

  const promptMessage = buildTimezoneInputHint(message);
  while (true) {
    const value = (await prompts.input(promptMessage, initial)).trim();
    if (!value) {
      return undefined;
    }

    const resolved = resolveCountryCityTimezone(value);
    if (resolved) {
      if (resolved.toLowerCase() !== value.toLowerCase()) {
        console.log(`Using timezone ${resolved}.`);
      }
      return resolved;
    }

    if (UTC_ALIASES.has(value.toLowerCase())) {
      console.error(
        "Use a Country/City timezone (for example America/New_York) or leave blank."
      );
      continue;
    }

    const matches = searchCountryCityTimezones(value);
    if (matches.length > 0) {
      console.error(`Timezone must be Country/City. Try one of: ${matches.join(", ")}`);
      continue;
    }

    console.error("Timezone must be a valid Country/City timezone or blank.");
  }
}
