import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { ArrowUp } from 'lucide-react';
import Header from './components/Header';
import Footer from './components/Footer';
import ProjectList from './components/ProjectList';
import ProjectCardSkeleton from './components/ProjectCardSkeleton';
import Toast from './components/Toast';
import { subscribeToProjects, verifyProjectPassword } from './lib/firebase';
import { AnimatePresence, motion } from 'framer-motion';

// Lazy Load Modals
const RegisterModal = React.lazy(() => import('./components/RegisterModal'));
const PasswordModal = React.lazy(() => import('./components/PasswordModal'));
const ProjectDetailModal = React.lazy(() => import('./components/ProjectDetailModal'));
const EntryGate = React.lazy(() => import('./components/EntryGate'));

function App() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('ktb_gallery_auth') === 'true';
  });

  const handleLogin = () => {
    setIsAuthenticated(true);
    sessionStorage.setItem('ktb_gallery_auth', 'true');
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [pendingEditProject, setPendingEditProject] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null); // For detail modal
  const [projects, setProjects] = useState([]);
  // Initialize from localStorage or default to 'latest'
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('project_sort_order') || 'latest');

  // Theme State
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) return savedTheme;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [theme]);

  const [loading, setLoading] = useState(true);

  // Save sort preference when changed
  useEffect(() => {
    localStorage.setItem('project_sort_order', sortBy);
  }, [sortBy]);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  // Generate Session ID for Likes if not exists
  useEffect(() => {
    if (!localStorage.getItem('hackathon_session_id')) {
      localStorage.setItem('hackathon_session_id', Math.random().toString(36).substring(2, 15));
    }
  }, []);

  useEffect(() => {
    // Subscribe to realtime updates
    const unsubscribe = subscribeToProjects(
      (data) => {
        setProjects(data);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load projects:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleEditClick = useCallback((project) => {
    setPendingEditProject(project);
    setIsPasswordModalOpen(true);
  }, []);

  const handlePasswordVerified = async (inputPassword) => {
    if (pendingEditProject) {
      const sessionId = localStorage.getItem('hackathon_session_id');
      const result = await verifyProjectPassword(pendingEditProject.id, inputPassword, sessionId);
      if (result.success) {
        setEditingProject(pendingEditProject);
        setIsModalOpen(true);
        return true;
      } else {
        return result; // Return full result object to handle specific error messages
      }
    }
    return false;
  };

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingProject(null);
  }, []);

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg);
    setToastType(type);
  };



  // Generation State
  const [selectedGeneration, setSelectedGeneration] = useState(3);

  // ... (existing code)

  const sortedProjects = React.useMemo(() => {
    return [...projects]
      .filter(p => (p.generation || 3) === selectedGeneration) // Filter by generation (default to 3)
      .sort((a, b) => {
        if (sortBy === 'likes') {
          const likesA = a.likes || 0;
          const likesB = b.likes || 0;
          if (likesA !== likesB) return likesB - likesA;
        }
        // Default to latest (createdAt)
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
        return dateB - dateA;
      });
  }, [projects, selectedGeneration, sortBy]);

  if (!isAuthenticated) {
    return (
      <Suspense fallback={null}>
        <EntryGate onLogin={handleLogin} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans transition-colors duration-200 flex flex-col">
      <Header
        onRegister={() => setIsModalOpen(true)}
        theme={theme}
        toggleTheme={toggleTheme}
        selectedGeneration={selectedGeneration}
        onSelectGeneration={setSelectedGeneration}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <div className="flex justify-end mb-6">
          <div className="bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700 inline-flex shadow-sm items-center transition-colors">
            <button
              onClick={() => setSortBy('latest')}
              className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${sortBy === 'latest'
                ? 'bg-kakao-yellow text-kakao-black shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
              등록순
            </button>
            <button
              onClick={() => setSortBy('likes')}
              className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${sortBy === 'likes'
                ? 'bg-kakao-yellow text-kakao-black shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
              좋아요순
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <ProjectList
            projects={sortedProjects}
            onEdit={handleEditClick}
            onCardClick={setSelectedProject}
          />
        )}
      </main>

      {/* Detail Modal */}
      <Suspense fallback={null}>
        <ProjectDetailModal
          project={selectedProject}
          isOpen={!!selectedProject}
          onClose={() => setSelectedProject(null)}
          showToast={showToast}
          onCommentSuccess={(msg) => showToast(msg, 'success')}
        />

        <RegisterModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          initialData={editingProject}
          onSuccess={(msg) => showToast(msg)}
          defaultGeneration={selectedGeneration}
        />

        <PasswordModal
          isOpen={isPasswordModalOpen}
          onClose={() => setIsPasswordModalOpen(false)}
          onVerify={handlePasswordVerified}
          title="프로젝트 수정"
          description="프로젝트 정보를 수정하려면 비밀번호를 입력하세요."
        />
      </Suspense>

      <AnimatePresence>
        {toastMessage && (
          <Toast
            message={toastMessage}
            type={toastType}
            onClose={() => setToastMessage('')}
          />
        )}
      </AnimatePresence>

      {/* Scroll to Top */}
      <ScrollToTop />

      <Footer />
    </div>
  );
}

const ScrollToTop = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };
    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 p-3 bg-kakao-black text-white rounded-full shadow-2xl hover:bg-gray-800 transition-colors border border-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-up"><path d="m18 15-6-6-6 6" /><path d="m12 21 12-12 12 12" /></svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default App;
