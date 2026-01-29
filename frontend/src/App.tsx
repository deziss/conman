import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Dashboard } from './pages/Dashboard';
import { Containers } from './pages/Containers';
import { ContainerDetails } from './pages/ContainerDetails';
import { Images } from './pages/Images';
import { Networks } from './pages/Networks';
import { Volumes } from './pages/Volumes';
import { Settings } from './pages/Settings';
import { Users } from './pages/Users';
import { Profile } from './pages/Profile';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ReactNode } from 'react';

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
                  <DashboardLayout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/containers" element={<Containers />} />
                      <Route path="/containers/:id" element={<ContainerDetails />} />
                      <Route path="/images" element={<Images />} />
                      <Route path="/networks" element={<Networks />} />
                      <Route path="/volumes" element={<Volumes />} />
                      <Route path="/users" element={<Users />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="*" element={<div className="text-slate-500 text-center mt-20">Work in Progress</div>} />
                    </Routes>
                  </DashboardLayout>
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
