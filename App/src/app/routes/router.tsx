import { createBrowserRouter, Navigate } from "react-router";
import { RequireAuth } from "../hooks/useAuthGuard";
import { AppShell } from "../components/layout/AppShell";
import { LoginScreen } from "../pages/auth/LoginScreen";
import { SignupScreen } from "../pages/auth/SignupScreen";
import { OnboardingScreen } from "../pages/auth/OnboardingScreen";
import { DashboardView } from "../pages/dashboard/DashboardView";
import { AllTasksPage } from "../pages/dashboard/detail/AllTasksPage";
import { ProgressPage } from "../pages/dashboard/detail/ProgressPage";
import { BlockersPage } from "../pages/dashboard/detail/BlockersPage";
import { InProgressPage } from "../pages/dashboard/detail/InProgressPage";
import { DashProgressPage } from "../pages/dashboard/detail/DashProgressPage";
import { UrgentTasksPage } from "../pages/dashboard/detail/UrgentTasksPage";
import { WorkloadPage } from "../pages/dashboard/detail/WorkloadPage";
import { ActivityPage } from "../pages/dashboard/detail/ActivityPage";
import { BoardView } from "../pages/board/BoardView";
import { MeetingsView } from "../pages/meetings/MeetingsView";
import { DeliverablesView } from "../pages/deliverables/DeliverablesView";
import { GithubView } from "../pages/github/GithubView";
import { ContributorsView } from "../pages/contributors/ContributorsView";
import { MyPageRoute } from "../pages/mypage/MyPageRoute";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginScreen /> },
  { path: "/signup", element: <SignupScreen /> },
  { path: "/onboarding", element: <OnboardingScreen /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "dashboard", element: <DashboardView /> },
          { path: "dashboard/all-tasks", element: <AllTasksPage /> },
          { path: "dashboard/progress", element: <ProgressPage /> },
          { path: "dashboard/blockers", element: <BlockersPage /> },
          { path: "dashboard/inprogress", element: <InProgressPage /> },
          { path: "dashboard/dash-progress", element: <DashProgressPage /> },
          { path: "dashboard/urgent", element: <UrgentTasksPage /> },
          { path: "dashboard/workload", element: <WorkloadPage /> },
          { path: "dashboard/activity", element: <ActivityPage /> },
          { path: "board", element: <BoardView /> },
          { path: "meetings", element: <MeetingsView /> },
          { path: "deliverables", element: <DeliverablesView /> },
          { path: "github", element: <GithubView /> },
          { path: "contributors", element: <ContributorsView /> },
          { path: "mypage", element: <MyPageRoute /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/login" replace /> },
]);
