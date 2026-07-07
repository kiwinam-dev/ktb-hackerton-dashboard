import React, { useState, useEffect, useRef } from 'react';

const ImageWithLoader = ({
	src,
	alt,
	className = '',
	imgClassName = '',
	fallbackSrc = "https://via.placeholder.com/640x360?text=No+Image",
	onError,
	loading = 'lazy',
	...props
}) => {
	const [isLoading, setIsLoading] = useState(true);
	const [currentSrc, setCurrentSrc] = useState(src);
	const [hasError, setHasError] = useState(false);
	const imgRef = useRef(null);

	// Reset state when src changes
	useEffect(() => {
		setIsLoading(true);
		setHasError(false);
		setCurrentSrc(src);
	}, [src]);

	// Fix for browser caching: if the image loads instantly, onLoad may not fire
	useEffect(() => {
		if (imgRef.current && imgRef.current.complete) {
			setIsLoading(false);
		}
	}, [currentSrc]);

	const handleLoad = () => {
		setIsLoading(false);
	};

	const handleError = (e) => {
		if (!hasError) {
			setHasError(true);
			setIsLoading(true);
			if (onError) {
				onError(e);
			}
			// Use fallback if fallbackSrc is provided and different
			if (fallbackSrc && currentSrc !== fallbackSrc) {
				setCurrentSrc(fallbackSrc);
			} else {
				setIsLoading(false);
			}
		} else {
			setIsLoading(false);
		}
	};

	return (
		<div className={`relative overflow-hidden ${className}`}>
			{/* Circular Spinner Indicator */}
			{isLoading && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800 z-10">
					<div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-kakao-black dark:border-t-kakao-yellow rounded-full animate-spin"></div>
				</div>
			)}
			{hasError && !isLoading ? (
				<div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-150 dark:bg-gray-700 text-gray-400 dark:text-gray-555 text-xs font-semibold p-2 text-center">
					<span>이미지 로드 실패</span>
				</div>
			) : currentSrc ? (
				<img
					ref={imgRef}
					src={currentSrc}
					alt={alt}
					loading={loading}
					onLoad={handleLoad}
					onError={handleError}
					className={`${imgClassName} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
					{...props}
				/>
			) : null}
		</div>
	);
};

export default React.memo(ImageWithLoader);
