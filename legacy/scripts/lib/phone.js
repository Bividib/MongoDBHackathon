function normalizePhoneNumber(input, defaultCountry = "GB") {
  const raw = String(input || "").trim();

  if (!raw) {
    throw new Error("Missing phone number");
  }

  const compact = raw.replace(/[^\d+]/g, "");

  if (compact.startsWith("+")) {
    return compact;
  }

  if (defaultCountry === "GB" && compact.startsWith("0")) {
    return `+44${compact.slice(1)}`;
  }

  throw new Error("Phone number must be E.164, or a UK local number starting with 0");
}

function maskPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/.(?=.{4})/g, "*");
}

module.exports = {
  maskPhoneNumber,
  normalizePhoneNumber,
};
