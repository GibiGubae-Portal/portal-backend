import Joi from "joi";
import { studentIdSchema } from "./common.js";

export const ENUMS = {
  gender: ["Male", "Female"],
  region: [
    "Addis_Ababa",
    "Dire_Dawa",
    "Tigray",
    "Afar",
    "Amhara",
    "Oromia",
    "Somali",
    "Benishangul_Gumuz",
    "SNNPR",
    "Sidama",
    "South_West_Ethiopia_Peoples_Region",
    "Central_Ethiopia_Region",
    "South_Ethiopia_Region",
    "Harari",
    "Not_Specified",
  ],
  mothertongue: [
    "Amharic",
    "Oromifa",
    "Tigrigna",
    "English",
    "Other",
    "Not_Specified",
  ],
  disability: [
    "None",
    "Physical",
    "Visual",
    "Hearing",
    "Intellectual",
    "Psychosocial",
    "Other",
  ],
  clergicalstatus: ["Deacon", "Priest", "Other", "None"],
  sponsorshiptype: ["Government", "Self_Sponsored", "Scholarship"],
  participation: [
    "Gbi_Gubaye_Secretariat",
    "Audit_and_Inspection_Section",
    "Education_and_Apostolic_Service_Section",
    "Accounting_and_Assets_Section",
    "Development_and_Income_Collection_Section",
    "Languages_and_Special_Interests_Section",
    "Hymns_and_Arts_Section",
    "Planning_Monitoring_Reports_and_Information_Management_Section",
    "Professional_and_Community_Development_Section",
    "Batch_and_Programs_Coordination_Section",
    "Member_Care_Advice_and_Capacity_Building_Section",
    "None",
  ],
  role: [
    "Member",
    "ClassSecretary",
    "ClassTeamLead",
    "ClassManager",
    "SubclassSecretary",
    "SubclassTeamLead",
    "SubclassManager",
    "None",
  ],
  advisors: ["Yes", "No"],
  activitylevel: ["Very_Active", "Active", "Less_Active", "Not_Active"],
};

// Older clients send "not_specified" (lower-case), but the DB enum value is
// "Not_Specified". Accept either spelling and store the canonical one.
const notSpecifiedEnum = (values) =>
  Joi.string()
    .trim()
    .empty(["", null])
    // .valid() would short-circuit before .custom(), so check membership here.
    .custom((value, helpers) => {
      const normalized = value === "not_specified" ? "Not_Specified" : value;
      return values.includes(normalized)
        ? normalized
        : helpers.error("any.only", { valids: values });
    })
    .default("Not_Specified");

const optionalText = (max, fallback) =>
  Joi.string().trim().max(max).empty(["", null]).default(fallback);

const nullableText = (max) =>
  Joi.string().trim().max(max).empty("").allow(null).default(null);

const universityUserSchema = Joi.object({
  departmentname: Joi.string().trim().min(1).max(100).required(),
  sponsorshiptype: Joi.string()
    .valid(...ENUMS.sponsorshiptype)
    .required(),
  participation: Joi.string()
    .valid(...ENUMS.participation)
    .default("None"),
  batch: Joi.number().integer().min(1900).max(2200).required(),
  coursetaken: Joi.boolean().default(true),
  tookcourse: Joi.boolean().allow(null).default(false),
  cafeteriaaccess: Joi.boolean().allow(null).default(false),
  holidayincampus: Joi.boolean().allow(null).default(false),
  mealcard: optionalText(100, "not_specified"),
  cafeterianame: nullableText(100),
  emergencyname: nullableText(100),
  emergencyphone: nullableText(20),
  confessionfather: optionalText(100, "not_specified"),
  advisors: Joi.string()
    .valid(...ENUMS.advisors)
    .default("No"),
  role: Joi.string()
    .valid(...ENUMS.role)
    .default("None"),
  activitylevel: Joi.string()
    .valid(...ENUMS.activitylevel)
    .default("Active"),
});

export const userSchema = Joi.object({
  studentid: studentIdSchema.required(),
  firstname: Joi.string().trim().min(1).max(50).required(),
  middlename: Joi.string().trim().max(50).empty(null).allow("").default(""),
  lastname: Joi.string().trim().min(1).max(50).required(),
  gender: Joi.string()
    .valid(...ENUMS.gender)
    .required(),
  baptismalname: optionalText(50, "None"),
  phone: Joi.string()
    .trim()
    .max(20)
    .pattern(/^\+?[0-9][0-9 -]{5,19}$/)
    .required()
    .messages({ "string.pattern.base": "Phone number is not valid" }),
  birthdate: Joi.date().iso().min("1900-01-01").max("now").required(),
  useremail: Joi.string()
    .trim()
    .lowercase()
    .max(320)
    .empty(["", null, "not_specified", "Not Specified"])
    .email({ tlds: { allow: false } })
    .default(null),
  nationality: Joi.string().trim().min(1).max(50).required(),
  region: notSpecifiedEnum(ENUMS.region),
  mothertongue: notSpecifiedEnum(ENUMS.mothertongue),
  zonename: optionalText(50, "not_specified"),
  isphysicallydisabled: Joi.string()
    .valid(...ENUMS.disability)
    .default("None"),
  clergicalstatus: Joi.string()
    .valid(...ENUMS.clergicalstatus)
    .default("None"),
  telegram_username: optionalText(50, "not_specified"),
  universityusers: universityUserSchema.required(),
});

const booleanQuery = Joi.boolean().truthy("true").falsy("false");

export const userQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  q: Joi.string().trim().max(100).allow(""),
  gender: Joi.string()
    .valid(...ENUMS.gender)
    .empty(""),
  clergicalstatus: Joi.string()
    .valid(...ENUMS.clergicalstatus)
    .empty(""),
  sponsorshiptype: Joi.string()
    .valid(...ENUMS.sponsorshiptype)
    .empty(""),
  participation: Joi.string()
    .valid(...ENUMS.participation)
    .empty(""),
  departmentname: Joi.string().trim().max(100).empty(""),
  department: Joi.string().trim().max(100).empty(""),
  batch: Joi.number().integer().min(1).empty(""),
  cafeteriaaccess: booleanQuery.empty(""),
  tookcourse: booleanQuery.empty(""),
  sortBy: Joi.string()
    .valid(
      "firstname",
      "lastname",
      "studentid",
      "gender",
      "clergicalstatus",
      "createdAt",
      "batch",
      "participation",
      "departmentname",
      "sponsorshiptype",
      "cafeteriaaccess",
      "tookcourse",
    )
    .empty(""),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});
