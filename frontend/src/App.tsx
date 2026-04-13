import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { DashboardLayout } from './layouts/DashboardLayout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HostProvider } from './contexts/HostContext';
import { LicenseProvider } from './contexts/LicenseContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { CacheProvider } from './contexts/CacheContext';
import { Loading } from './components/ui/Loading';
import type { ReactNode } from 'react';

// Lazy Page Imports
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Containers = lazy(() => import('./pages/Containers').then(m => ({ default: m.Containers })));
const ContainerDetails = lazy(() => import('./pages/ContainerDetails').then(m => ({ default: m.ContainerDetails })));
const ContainerLogsPage = lazy(() => import('./pages/ContainerLogsPage').then(m => ({ default: m.ContainerLogsPage })));
const Images = lazy(() => import('./pages/Images').then(m => ({ default: m.Images })));
const ImageDetailsPage = lazy(() => import('./pages/ImageDetailsPage').then(m => ({ default: m.ImageDetailsPage })));
const Networks = lazy(() => import('./pages/Networks').then(m => ({ default: m.Networks })));
const NetworkDetailsPage = lazy(() => import('./pages/NetworkDetailsPage').then(m => ({ default: m.NetworkDetailsPage })));
const Volumes = lazy(() => import('./pages/Volumes').then(m => ({ default: m.Volumes })));
const Hosts = lazy(() => import('./pages/Hosts').then(m => ({ default: m.Hosts })));
const HostDetails = lazy(() => import('./pages/HostDetails').then(m => ({ default: m.HostDetails })));
const Users = lazy(() => import('./pages/Users').then(m => ({ default: m.Users })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Stacks = lazy(() => import('./pages/Stacks').then(m => ({ default: m.Stacks })));
// const StackDetails = lazy(() => import('./pages/StackDetails').then(m => ({ default: m.StackDetails }))); // Commented out to fix build

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <CacheProvider>
          <AuthProvider>
            <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <LicenseProvider>
                    <HostProvider>
                    <DashboardLayout>
                      <Suspense fallback={<Loading />}>
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
                          <Route path="/stacks" element={<Stacks />} /> 
                          {/* <Route path="/stacks/:id" element={<StackDetails />} /> */}
                          <Route path="/hosts" element={<Hosts />} />
                          <Route path="/hosts/:id" element={<HostDetails />} />
                          <Route path="/users" element={<Users />} />
                          <Route path="/profile" element={<Profile />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="*" element={<div className="text-slate-500 text-center mt-20">Work in Progress</div>} />
                        </Routes>
                      </Suspense>
                    </DashboardLayout>
                    </HostProvider>
                    </LicenseProvider>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
      </CacheProvider>
    </SettingsProvider>
  </ThemeProvider>
  );
}

export default App;
