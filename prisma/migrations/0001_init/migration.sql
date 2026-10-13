-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('Very_Active', 'Active', 'Less_Active', 'Not_Active');

-- CreateEnum
CREATE TYPE "clerical_status" AS ENUM ('Deacon', 'Priest', 'Other', 'None');

-- CreateEnum
CREATE TYPE "gender_type" AS ENUM ('Female', 'Male');

-- CreateEnum
CREATE TYPE "advisor_type" AS ENUM ('Yes', 'No');

-- CreateEnum
CREATE TYPE "regions_type" AS ENUM ('Addis_Ababa', 'Dire_Dawa', 'Tigray', 'Afar', 'Amhara', 'Oromia', 'Somali', 'Benishangul_Gumuz', 'SNNPR', 'Sidama', 'South_West_Ethiopia_Peoples_Region', 'Central_Ethiopia_Region', 'South_Ethiopia_Region', 'Harari', 'Not_Specified');

-- CreateEnum
CREATE TYPE "languages_type" AS ENUM ('Amharic', 'Oromifa', 'Tigrigna', 'Not_Specified', 'English', 'Other');

-- CreateEnum
CREATE TYPE "disability_type" AS ENUM ('None', 'Physical', 'Visual', 'Hearing', 'Intellectual', 'Psychosocial', 'Other');

-- CreateEnum
CREATE TYPE "participation_type" AS ENUM ('Gbi Gubaye Secretariat', 'Audit and Inspection Section', 'Education and Apostolic Service Section', 'Accounting and Assets Section', 'Development and Income Collection Section', 'Languages and Special Interests Section', 'Hymns and Arts Section', 'Planning Monitoring Reports and Information Management Section', 'Professional and Community Development Section', 'Batch and Programs Coordination Section', 'Member Care Advice and Capacity Building Section', 'None');

-- CreateEnum
CREATE TYPE "role_type" AS ENUM ('Member', 'ClassSecretary', 'ClassTeamLead', 'ClassManager', 'SubclassSecretary', 'SubclassTeamLead', 'SubclassManager', 'None');

-- CreateEnum
CREATE TYPE "sponsorship_type" AS ENUM ('Government', 'Self_Sponsored', 'Scholarship');

-- CreateTable
CREATE TABLE "User" (
    "userid" SERIAL NOT NULL,
    "studentid" VARCHAR(20) NOT NULL,
    "createdBy" VARCHAR(20),
    "firstname" VARCHAR(50) NOT NULL,
    "middlename" VARCHAR(50) NOT NULL,
    "lastname" VARCHAR(50) NOT NULL,
    "gender" "gender_type" NOT NULL,
    "baptismalname" VARCHAR(50) NOT NULL DEFAULT 'None',
    "phone" VARCHAR(20) NOT NULL,
    "birthdate" DATE NOT NULL,
    "useremail" VARCHAR(320),
    "nationality" VARCHAR(50) NOT NULL,
    "isphysicallydisabled" "disability_type" NOT NULL DEFAULT 'None',
    "zonename" VARCHAR(50) NOT NULL DEFAULT 'not_specified',
    "mothertongue" "languages_type" NOT NULL DEFAULT 'Not_Specified',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "region" "regions_type" NOT NULL DEFAULT 'Not_Specified',
    "clergicalstatus" "clerical_status" NOT NULL DEFAULT 'None',
    "telegram_username" VARCHAR(50) NOT NULL DEFAULT 'not_specified',

    CONSTRAINT "User_pkey" PRIMARY KEY ("userid")
);

-- CreateTable
CREATE TABLE "admin" (
    "adminid" SERIAL NOT NULL,
    "studentid" VARCHAR(20) NOT NULL,
    "adminusername" VARCHAR(50) NOT NULL,
    "adminpassword" VARCHAR(1000) NOT NULL,
    "readUsers" BOOLEAN NOT NULL DEFAULT false,
    "registerUsers" BOOLEAN NOT NULL DEFAULT false,
    "editAnyUser" BOOLEAN NOT NULL DEFAULT false,
    "editSpecificUsers" BOOLEAN NOT NULL DEFAULT false,
    "removeAnyUsers" BOOLEAN NOT NULL DEFAULT false,
    "removeSpecificUsers" BOOLEAN NOT NULL DEFAULT false,
    "passwordUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("adminid")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "readUsers" BOOLEAN NOT NULL DEFAULT false,
    "registerUsers" BOOLEAN NOT NULL DEFAULT false,
    "editAnyUser" BOOLEAN NOT NULL DEFAULT false,
    "editSpecificUsers" BOOLEAN NOT NULL DEFAULT false,
    "removeAnyUsers" BOOLEAN NOT NULL DEFAULT false,
    "removeSpecificUsers" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "universityusers" (
    "userid" INTEGER NOT NULL,
    "departmentname" VARCHAR(100) NOT NULL,
    "sponsorshiptype" "sponsorship_type" NOT NULL,
    "participation" "participation_type" NOT NULL DEFAULT 'None',
    "cafeteriaaccess" BOOLEAN DEFAULT false,
    "mealcard" VARCHAR(100) DEFAULT 'not_specified',
    "cafeterianame" VARCHAR(100),
    "emergencyname" VARCHAR(100),
    "emergencyphone" VARCHAR(20),
    "batch" INTEGER NOT NULL,
    "confessionfather" VARCHAR(100) DEFAULT 'not_specified',
    "advisors" "advisor_type" NOT NULL DEFAULT 'No',
    "role" "role_type" NOT NULL DEFAULT 'None',
    "coursetaken" BOOLEAN NOT NULL DEFAULT true,
    "holidayincampus" BOOLEAN DEFAULT false,
    "tookcourse" BOOLEAN DEFAULT false,
    "activitylevel" "activity_type" NOT NULL DEFAULT 'Active',

    CONSTRAINT "universityusers_pkey" PRIMARY KEY ("userid")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_studentid_key" ON "User"("studentid");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_useremail_key" ON "User"("useremail");

-- CreateIndex
CREATE INDEX "User_createdBy_idx" ON "User"("createdBy");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_studentid_key" ON "admin"("studentid");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "universityusers_batch_idx" ON "universityusers"("batch");

-- AddForeignKey
ALTER TABLE "universityusers" ADD CONSTRAINT "universityusers_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

