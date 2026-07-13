import { Switch, Route, Redirect } from "wouter";
import "./lib/i18n";

import { Layout } from "./components/layout";
import { ProtectedRoute } from "./components/protected-route";
import { RoleGate } from "./components/role-gate";

import LandingPage from "./pages/landing";
import SignInPage from "./pages/sign-in";
import SignUpPage from "./pages/sign-up";
import AcceptInvitePage from "./pages/accept-invite";
import DashboardPage from "./pages/dashboard";
import LeadsPage from "./pages/leads/index";
import LeadDetailPage from "./pages/leads/lead-detail";
import ContactsPage from "./pages/contacts/index";
import DevelopmentsPage from "./pages/developments";
import InventoryPage from "./pages/inventory/index";
import PropertiesPage from "./pages/properties/index";
import TasksPage from "./pages/tasks";
import AgentsPage from "./pages/agents";
import AnalyticsPage from "./pages/analytics";
import SettingsPage from "./pages/settings";

function ProtectedPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/accept-invite" component={AcceptInvitePage} />

      <Route path="/dashboard"><ProtectedPage><DashboardPage /></ProtectedPage></Route>
      <Route path="/leads"><ProtectedPage><LeadsPage /></ProtectedPage></Route>
      <Route path="/leads/:id"><ProtectedPage><LeadDetailPage /></ProtectedPage></Route>
      <Route path="/contacts"><ProtectedPage><ContactsPage /></ProtectedPage></Route>
      <Route path="/developments"><ProtectedPage><DevelopmentsPage /></ProtectedPage></Route>
      <Route path="/inventory"><ProtectedPage><InventoryPage /></ProtectedPage></Route>
      <Route path="/properties"><ProtectedPage><PropertiesPage /></ProtectedPage></Route>
      <Route path="/tasks"><ProtectedPage><TasksPage /></ProtectedPage></Route>

      <Route path="/agents">
        <ProtectedRoute>
          <RoleGate><Layout><AgentsPage /></Layout></RoleGate>
        </ProtectedRoute>
      </Route>
      <Route path="/analytics">
        <ProtectedRoute>
          <RoleGate><Layout><AnalyticsPage /></Layout></RoleGate>
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <RoleGate><Layout><SettingsPage /></Layout></RoleGate>
        </ProtectedRoute>
      </Route>

      <Route><Redirect to="/" /></Route>
    </Switch>
  );
}
