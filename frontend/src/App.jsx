import { Link, Route, Routes } from "react-router-dom";
import Layout, { RequireRole } from "./components/Layout.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Incident from "./pages/Incident.jsx";
import PublicMap from "./pages/PublicMap.jsx";
import Scoreboard from "./pages/Scoreboard.jsx";
import Grap from "./pages/Grap.jsx";
import Report from "./pages/citizen/Report.jsx";
import MyReports from "./pages/citizen/MyReports.jsx";
import Queue from "./pages/officer/Queue.jsx";
import History from "./pages/officer/History.jsx";
import Nodal from "./pages/nodal/Nodal.jsx";
import Command from "./pages/admin/Command.jsx";
import Policies from "./pages/admin/Policies.jsx";

const NotFound = () => (
  <div className="wrap page">
    <h1>Page not found</h1>
    <p className="muted">That page does not exist. <Link to="/">Go to the home page</Link>.</p>
  </div>
);

const only = (roles, el) => <RequireRole roles={roles}>{el}</RequireRole>;

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="map" element={<PublicMap />} />
        <Route path="scoreboard" element={<Scoreboard />} />
        <Route path="grap" element={<Grap />} />
        <Route path="incident/:id" element={<Incident />} />

        <Route path="report" element={only(["citizen"], <Report />)} />
        <Route path="my-reports" element={only(["citizen"], <MyReports />)} />

        <Route path="officer" element={only(["officer"], <Queue mode="officer" />)} />
        <Route path="officer/closed" element={only(["officer"], <History />)} />

        <Route path="nodal" element={only(["nodal"], <Nodal />)} />
        <Route path="nodal/queue" element={only(["nodal"], <Queue mode="nodal" />)} />

        <Route path="admin" element={only(["admin"], <Command />)} />
        <Route path="admin/incidents" element={only(["admin"], <Queue mode="admin" />)} />
        <Route path="admin/policies" element={only(["admin"], <Policies />)} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
