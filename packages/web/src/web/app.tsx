import { Switch, Route, Redirect } from "wouter";
import "./lib/i18n"; // initialize i18n (side-effect)

// Layouts & shared
import { Layout } from "./components/layout";
import { ProtectedRoute } from "./components/protected-route";
import { RoleGate } from "./components/role-gate";

// Pages
import LandingPage from "./pages/landing";
import SignInPage from "./pages/sign-in";
import SignUpPage from "./pages/sign-up";
import DashboardPage from "./pages/dashboard";
import LeadsPage from "./pages/leads/index";
import LeadDetailPage from "./pages/leads/lead-detail";
import PropertiesPage from "./pages/properties/index";
import TasksPage from "./pages/tasks";
import AgentsPage from "./pages/agents";
import AnalyticsPage from "./pages/analytics";
import SettingsPage from "./pages/settings";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />

      <Route path="/dashboard">
        <ProtectedRoute>
          <Layout>
            <DashboardPage />
          </Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/leads">
        <ProtectedRoute>
          <Layout>
            <LeadsPage />
          </Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/leads/:id">
        <ProtectedRoute>
          <Layout>
            <LeadDetailPage />
          </Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/properties">
        <ProtectedRoute>
          <Layout>
            <PropertiesPage />
          </Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/tasks">
        <ProtectedRoute>
          <Layout>
            <TasksPage />
          </Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/agents">
        <ProtectedRoute>
          <RoleGate>
            <Layout>
              <AgentsPage />
            </Layout>
          </RoleGate>
        </ProtectedRoute>
      </Route>

      <Route path="/analytics">
        <ProtectedRoute>
          <RoleGate>
            <Layout>
              <AnalyticsPage />
            </Layout>
          </RoleGate>
        </ProtectedRoute>
      </Route>

      <Route path="/settings">
        <ProtectedRoute>
          <RoleGate>
            <Layout>
              <SettingsPage />
            </Layout>
          </RoleGate>
        </ProtectedRoute>
      </Route>

      {/* Catch-all */}
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}
