export const APPLICATION_STAGES = [
  "待投递",
  "已投递",
  "待测评",
  "待笔试",
  "泡池子ing",
  "面试",
  "Offer",
  "已拒绝",
  "已放弃",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export type Application = {
  id: string;
  workspaceId: string;
  ownerId: string;
  company: string;
  role: string;
  location: string;
  stage: ApplicationStage;
  appliedOn: string | null;
  nextStep: string;
  deadline: string | null;
  jobUrl: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationInput = Pick<
  Application,
  | "company"
  | "role"
  | "location"
  | "stage"
  | "appliedOn"
  | "nextStep"
  | "deadline"
  | "notes"
> & {
  companyWebsite: string | null;
};

export type SharedCompany = {
  id: string;
  name: string;
  website: string | null;
};

export type ApplicationFilters = {
  ownerId?: string;
  stage?: ApplicationStage;
};

export type ApplicationSummary = {
  total: number;
  interviewing: number;
  pending: number;
  offers: number;
};

export type WorkspaceMember = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
};
