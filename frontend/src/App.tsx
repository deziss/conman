import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense } from 'react';
import { lazyRetry } from './utils/lazyRetry';
import { DashboardLayout } from './layouts/DashboardLayout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HostProvider } from './contexts/HostContext';
import { LicenseProvider } from './contexts/LicenseContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { CacheProvider } from './contexts/CacheContext';
import { TaskProvider } from './contexts/TaskContext';
import { TaskToastDrawer } from './components/ui/TaskToastDrawer';
import { Loading } from './components/ui/Loading';
import { Toaster } from 'react-hot-toast';
import type { ReactNode } from 'react';

// Lazy Page Imports
const Login = lazyRetry(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Dashboard = lazyRetry(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Containers = lazyRetry(() => import('./pages/Containers').then(m => ({ default: m.Containers })));
const ContainerDetails = lazyRetry(() => import('./pages/ContainerDetails').then(m => ({ default: m.ContainerDetails })));
const ContainerLogsPage = lazyRetry(() => import('./pages/ContainerLogsPage').then(m => ({ default: m.ContainerLogsPage })));
const Images = lazyRetry(() => import('./pages/Images').then(m => ({ default: m.Images })));
const ImageDetailsPage = lazyRetry(() => import('./pages/ImageDetailsPage').then(m => ({ default: m.ImageDetailsPage })));
const Networks = lazyRetry(() => import('./pages/Networks').then(m => ({ default: m.Networks })));
const NetworkDetailsPage = lazyRetry(() => import('./pages/NetworkDetailsPage').then(m => ({ default: m.NetworkDetailsPage })));
const Volumes = lazyRetry(() => import('./pages/Volumes').then(m => ({ default: m.Volumes })));
const Hosts = lazyRetry(() => import('./pages/Hosts').then(m => ({ default: m.Hosts })));
const HostDetails = lazyRetry(() => import('./pages/HostDetails').then(m => ({ default: m.HostDetails })));
const Users = lazyRetry(() => import('./pages/Users').then(m => ({ default: m.Users })));
const Profile = lazyRetry(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Settings = lazyRetry(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Stacks = lazyRetry(() => import('./pages/Stacks').then(m => ({ default: m.Stacks })));
const Activities = lazyRetry(() => import('./pages/Activities').then(m => ({ default: m.Activities })));

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
              <TaskProvider>
                <Toaster 
                  position="top-right" 
                  toastOptions={{
                    duration: 4000,
                    style: {
                      borderRadius: '12px',
                      fontSize: '13px',
                    },
                    className: 'dark:!bg-slate-900 dark:!text-slate-100 dark:!border dark:!border-slate-800 shadow-xl'
                  }}
                />
                <TaskToastDrawer />
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
                                    <Route path="/activities" element={<Activities />} /> 
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
              </TaskProvider>
            </BrowserRouter>
          </AuthProvider>
        </CacheProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export default App;
