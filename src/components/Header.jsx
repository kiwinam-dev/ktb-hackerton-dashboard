import React from 'react';
import { Sparkles, Plus, Moon, Sun } from 'lucide-react';

const Header = ({ onRegister, theme, toggleTheme, selectedGeneration, onSelectGeneration }) => {
	return (
		<header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors duration-200">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
				<div className="flex items-center space-x-4">
					<h1 className="text-xl font-bold text-kakao-black dark:text-white tracking-tight">
						KTB 프로젝트 갤러리
					</h1>
					<div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
						{[1, 2, 3, 4].map((gen) => (
							<button
								key={gen}
								onClick={() => onSelectGeneration(gen)}
								className={`px-3 py-1 text-sm font-bold rounded-md transition-all ${selectedGeneration === gen
									? 'bg-white dark:bg-gray-600 text-kakao-black dark:text-white shadow-sm'
									: 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
									}`}
							>
								{gen}기
							</button>
						))}
					</div>
				</div>
				<div className="flex items-center gap-3">
					<button
						onClick={toggleTheme}
						className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
						title={theme === 'dark' ? '라이트 모드로 변경' : '다크 모드로 변경'}
					>
						{theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
					</button>
					<button
						onClick={onRegister}
						className="bg-kakao-yellow text-kakao-black px-4 py-2 rounded-md font-medium text-sm hover:bg-yellow-400 transition-colors flex items-center space-x-2"
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
