import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { verifySystemPassword } from '../lib/firebase';
import { Lock } from 'lucide-react';

const EntryGate = ({ onLogin }) => {
	const [password, setPassword] = useState('');
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(false);
	const [shake, setShake] = useState(0);

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (loading) return;
		setLoading(true);

		const isValid = await verifySystemPassword(password);

		setLoading(false);
		if (isValid) {
			onLogin();
		} else {
			setError(true);
			setShake(prev => prev + 1);
			setTimeout(() => setError(false), 2000);
		}
	};

	return (
		<div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
			<motion.div
				initial={{ opacity: 0, scale: 0.9 }}
				animate={{ opacity: 1, scale: 1 }}
				className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700"
			>
				<div className="text-center mb-8">
					<div className="w-16 h-16 bg-kakao-yellow rounded-full flex items-center justify-center mx-auto mb-4 text-kakao-black shadow-md">
						<Lock className="w-8 h-8" />
					</div>
					<h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
						KTB 프로젝트 갤러리
					</h1>
					<p className="text-gray-500 dark:text-gray-400">
						내부 구경을 위해 입장 코드를 입력해주세요.
					</p>
				</div>

				<motion.form
					onSubmit={handleSubmit}
					className="space-y-4"
					animate={{ x: error ? [0, -10, 10, -10, 10, 0] : 0 }}
					key={shake}
					transition={{ duration: 0.3 }}
				>
					<div>
						<input
							type="password"
							value={password}
							onChange={(e) => {
								setPassword(e.target.value);
								setError(false);
							}}
							placeholder="입장 코드 입력"
							className={`w-full px-4 py-3 rounded-xl border ${error
								? 'border-red-500 focus:ring-red-500'
								: 'border-gray-200 dark:border-gray-600 focus:border-kakao-yellow focus:ring-kakao-yellow'
								} bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 transition-all text-center text-lg tracking-widest`}
							autoFocus
						/>
						{error && (
							<p className="text-red-500 text-sm mt-2 text-center">
								코드가 올바르지 않습니다.
							</p>
						)}
					</div>

					<button
						type="submit"
						className="w-full py-3 bg-kakao-yellow hover:bg-yellow-400 text-kakao-black font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
						disabled={!password || loading}
					>
						{loading ? (
							<div className="w-5 h-5 border-2 border-kakao-black border-t-transparent rounded-full animate-spin" />
						) : (
							'입장하기'
						)}
					</button>

					<div className="text-center">
						<p className="text-xs text-gray-400 mt-4">
							* 카카오테크부트캠프 프로젝트 내부 공유용 서비스입니다.
						</p>
					</div>
				</motion.form>
			</motion.div>
		</div>
	);
};

export default EntryGate;
