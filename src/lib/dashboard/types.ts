export type DashboardTrendPoint = {
  month: string;
  usersNew: number;
  usersTotal: number;
  invitationsSent: number;
  invitationsPending: number;
  productsNew: number;
  productsActive: number;
};

export type DashboardInsights = {
  memberCount: number;
  pendingInvitationCount: number;
  productCount: number;
  productActiveCount: number;
  chartData: DashboardTrendPoint[];
  errorMessage: string | null;
};
