import React from 'react';
import { Plus, Moon, Sun, Vote, LayoutGrid } from 'lucide-react';

const Header = ({ 
	onRegister, 
	theme, 
	toggleTheme, 
	selectedGeneration, 
	onSelectGeneration,
	currentView = 'gallery',
	onViewChange,
	generations = []
}) => {
	return (
		<header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors duration-200">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
				<div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
					<h1 
						onClick={() => onViewChange('gallery')}
						className="text-xl font-black text-kakao-black dark:text-white tracking-tight cursor-pointer hover:opacity-90 transition-opacity"
					>
						KTB 프로젝트 갤러리
					</h1>
					
					{/* Navigation tabs */}
					<div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 text-xs sm:text-sm font-bold">
						<button
							onClick={() => onViewChange('gallery')}
							className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${currentView === 'gallery'
								? 'bg-white dark:bg-gray-600 text-kakao-black dark:text-white shadow-sm'
								: 'text-gray-555 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
								}`}
						>
							<LayoutGrid className="w-3.5 h-3.5" />
							<span>갤러리</span>
						</button>
						<button
							onClick={() => onViewChange('vote')}
							className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${currentView === 'vote'
								? 'bg-white dark:bg-gray-600 text-kakao-black dark:text-white shadow-sm'
								: 'text-gray-555 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
								}`}
						>
							<Vote className="w-3.5 h-3.5" />
							<span>투표하기</span>
						</button>
					</div>

					{/* Generation selector: only shown on gallery view */}
					{currentView === 'gallery' && generations.length > 0 && (
						<div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
							{generations.map((gen) => (
								<button
									key={gen.value}
									onClick={() => onSelectGeneration(gen.value)}
									className={`px-2.5 py-1 text-xs sm:text-sm font-bold rounded-md transition-all ${selectedGeneration === gen.value
										? 'bg-white dark:bg-gray-600 text-kakao-black dark:text-white shadow-sm'
										: 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
										}`}
								>
									{gen.name}
								</button>
							))}
						</div>
					)}
				</div>

				<div className="flex items-center gap-3">
					<button
						onClick={toggleTheme}
						className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-650 dark:text-gray-300"
						title={theme === 'dark' ? '라이트 모드로 변경' : '다크 모드로 변경'}
					>
						{theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
					</button>
					<button
						onClick={onRegister}
						className="bg-kakao-yellow text-kakao-black px-4 py-2 rounded-md font-bold text-xs sm:text-sm hover:bg-yellow-400 transition-colors flex items-center space-x-2 shadow-sm"
					>
						<Plus className="h-4 w-4" />
						<span>프로젝트 등록하기</span>
					</button>
				</div>
			</div>
		</header>
	);
};

export default Header;
