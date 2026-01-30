import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Dashboard } from './pages/Dashboard';
import { Containers } from './pages/Containers';
import { ContainerDetails } from './pages/ContainerDetails';
import { Images } from './pages/Images';
import { ImageDetailsPage } from './pages/ImageDetailsPage';
import { NetworkDetailsPage } from './pages/NetworkDetailsPage';
import { ContainerLogsPage } from './pages/ContainerLogsPage';
import { Networks } from './pages/Networks';
import { Volumes } from './pages/Volumes';
import { Hosts } from './pages/Hosts';
import { Settings } from './pages/Settings';
import { Users } from './pages/Users';
import { Profile } from './pages/Profile';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HostProvider } from './contexts/HostContext';
import { ThemeProvider } from './contexts/ThemeContext';
import type { ReactNode } from 'react';

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <HostProvider>
                  <DashboardLayout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/containers" element={<Containers />} />
                      <Route path="/containers/:id" element={<ContainerDetails />} />
                      <Route path="/containers/:id/logs" element={<ContainerLogsPage />} />
                      <Route path="/images" element={<Images />} />
                      <Route path="/images/:id" element={<ImageDetailsPage />} />
                      <Route path="/networks" element={<Networks />} />
                      <Route path="/networks/:id" element={<NetworkDetailsPage />} />
                      <Route path="/volumes" element={<Volumes />} />
                      <Route path="/hosts" element={<Hosts />} />
                      <Route path="/users" element={<Users />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="*" element={<div className="text-slate-500 text-center mt-20">Work in Progress</div>} />
                    </Routes>
                  </DashboardLayout>
                  </HostProvider>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
