import React from 'react';
import ProjectCard from './ProjectCard';
import { motion } from 'framer-motion';

const container = {
	hidden: { opacity: 0 },
	show: {
		opacity: 1,
		transition: {
			staggerChildren: 0.1
		}
	}
};

const ProjectList = ({ projects, onEdit, onCardClick, students = [] }) => {
	if (projects.length === 0) {
		return (
			<div className="text-center py-24 flex flex-col items-center justify-center">
				<div className="text-6xl mb-6 animate-bounce">🦁</div>
				<h3 className="text-xl text-gray-900 dark:text-white font-bold mb-2">아직 등록된 프로젝트가 없어요!</h3>
				<p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto leading-relaxed">
					카테부 친구들의 첫 번째 프로젝트 주인공이 되어주세요.<br />
					오른쪽 위 <span className="font-bold text-kakao-black dark:text-yellow-400">등록하기</span> 버튼을 눌러보세요!
				</p>
			</div>
		);
	}

	return (
		<motion.div
			variants={container}
			initial="hidden"
			animate="show"
			className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
		>
			{projects.map((project) => (
				<ProjectCard key={project.id} project={project} onEdit={onEdit} onClick={onCardClick} students={students} />
			))}
		</motion.div>
	);
};

export default ProjectList;
