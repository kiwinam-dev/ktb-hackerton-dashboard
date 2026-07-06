import React from 'react';
import { Github, Instagram, Link as LinkIcon } from 'lucide-react';

const Footer = ({ onAdminClick }) => {
	return (
		<footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-8 mt-auto transition-colors duration-200">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex flex-col md:flex-row justify-between items-center gap-4">
					<div className="flex flex-col items-center md:items-start space-y-2">
						<div className="text-sm font-bold text-gray-900 dark:text-white">
							카카오 테크 부트캠프
						</div>
						<p className="text-xs text-gray-500 dark:text-gray-400">
							© 2025 Kakao Tech Bootcamp. All rights reserved.
						</p>
					</div>

					<div className="flex items-center gap-6">
						<a
							href="https://kakaotechbootcamp.com/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-gray-500 hover:text-kakao-black dark:text-gray-400 dark:hover:text-white transition-colors flex items-center gap-1 text-sm font-medium"
						>
							<LinkIcon className="w-4 h-4" />
							<span>공식 홈페이지</span>
						</a>
						<a
							href="https://www.instagram.com/kakao_tech_bootcamp/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-gray-500 hover:text-pink-600 dark:text-gray-400 dark:hover:text-pink-400 transition-colors flex items-center gap-1 text-sm font-medium"
						>
							<Instagram className="w-4 h-4" />
							<span>인스타그램</span>
						</a>
					</div>
				</div>

				<div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
					<p className="text-xs text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1">
						Designed & Developed by <span className="font-bold text-gray-600 dark:text-gray-300">Charlie Park</span> 🧑‍💻
					</p>
					{onAdminClick && (
						<button
							onClick={onAdminClick}
							className="text-xs text-gray-450 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 transition-colors underline font-bold cursor-pointer"
						>
							관리자 페이지 바로가기
						</button>
					)}
				</div>
			</div>
		</footer>
	);
};

export default Footer;
