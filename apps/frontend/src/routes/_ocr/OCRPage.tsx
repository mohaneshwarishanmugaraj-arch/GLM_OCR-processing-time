// import { useState } from 'react'
// import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { FileUpload, type TaskResponse, type UploadedFile } from './FileUpload'
import { FilePreview } from './FilePreview'
import { OCRResults } from './OCRResults'
import { useState } from 'react'

export function OCRPage() {
	const [uploadFile, setUploadFile] = useState<UploadedFile | null>(null)
	const [parsedResult, setParsedResult] = useState<TaskResponse | null>(null)




	return (
		<div className='h-screen flex overflow-hidden bg-gray-50 dark:bg-gray-950'>
			<div className='w-60 shrink-0 border-r border-slate-200 dark:border-slate-800'>
				<div className='border-b border-slate-200 p-3 dark:border-slate-800'>
					<Link
						to='/performance'
						className='inline-flex w-full items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-500/20 dark:text-cyan-300'
					>
						Performance Benchmark
					</Link>
				</div>
				<FileUpload
					onFileUploaded={file => {
						setUploadFile(file)
					}}
					onTaskStatusChange={data => {
						setParsedResult(data)
					}}
				/>
			</div>

			<main className='h-screen flex-1 min-w-0 grid grid-cols-2 overflow-hidden'>
				<FilePreview file={uploadFile} result={parsedResult} />
				<OCRResults result={parsedResult} fileName={uploadFile?.name} />
			</main>
		</div>
	)
}
