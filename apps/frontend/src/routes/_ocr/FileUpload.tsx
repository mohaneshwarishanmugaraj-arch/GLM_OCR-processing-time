import { useState, useRef, useEffect } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { cn } from '@/libs/utils'
import { uploadTask, getTaskStatus, getTestFiles, submitTestFile, getTestFileBlob, type TaskStatus, type TaskStatusData } from '@/libs/api'
import { toast } from 'sonner'


export type Layout = {
	block_content: string
	bbox: [number, number, number, number] | null
	block_id: number
	text_length?: number | null
}

export interface UploadedFile {
	id: string
	name: string
	size: number
	type: string
	file: File
	uploadTime: Date
	error: string | null
}

export interface TaskResponse {
	fileId: string
	status: TaskStatus
	response: TaskStatusData | null
	error_message?: string | null
}

interface FileUploadProps {
	onFileUploaded: (params: UploadedFile) => void
	onTaskStatusChange?: (params: TaskResponse) => void
}

// 允许的文件格式
const ALLOWED_FILE_TYPES = [
	'image/png',
	'image/jpeg',
	'image/jpg',
	'application/pdf'
]

// 允许的文件扩展名（用于备用验证）
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf']
// const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf', '.doc', '.docx']

// 文件大小限制：20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB in bytes


// 验证文件类型
const isValidFileType = (file: File): boolean => {
	// 检查 MIME 类型
	if (ALLOWED_FILE_TYPES.includes(file.type)) {
		return true
	}

	// 备用检查：通过文件扩展名
	const fileName = file.name.toLowerCase()
	return ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext))
}

// 验证文件大小
const isValidFileSize = (file: File): boolean => {
	return file.size <= MAX_FILE_SIZE
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
	if (bytes < 1024) return bytes + ' B'
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
	return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

export function FileUpload({ onFileUploaded, onTaskStatusChange }: FileUploadProps) {
	const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
	const [isLoading, setIsLoading] = useState(false)
	const [testFiles, setTestFiles] = useState<string[]>([])
	const [searchQuery, setSearchQuery] = useState('')

	useEffect(() => {
		getTestFiles().then(setTestFiles).catch(console.error)
	}, [])

	const filteredTestFiles = testFiles.filter(f => f.toLowerCase().includes(searchQuery.toLowerCase()))

	const handleTestFileSelect = async (filename: string) => {
		if (isLoading) return
		setIsLoading(true)
		try {
			// 先获取文件的实际内容，以便能够预览
			const fileBlob = await getTestFileBlob(filename)
			const fileType = filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
			const realFile = new File([fileBlob], filename, { type: fileType })

			const uploadedFile: UploadedFile = {
				id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				name: filename,
				size: fileBlob.size,
				type: fileType,
				file: realFile,
				uploadTime: new Date(),
				error: null
			}
			setSelectedFile(uploadedFile)

			const response = await submitTestFile(filename)
			const taskId = String(response.task_id)
			onFileUploaded(uploadedFile)
			if (taskId) {
				startPolling(uploadedFile.id, taskId)
			}
		} catch (error: any) {
			toast.error(error.message || 'Failed to submit test file')
			setSelectedFile(null)
			setIsLoading(false)
		}
	}


	const handleDragOver = (e: React.DragEvent) => {
		if (isLoading) return
		e.preventDefault()
		setIsDragging(true)
	}

	const handleDragLeave = (e: React.DragEvent) => {
		if (isLoading) return
		e.preventDefault()
		setIsDragging(false)
	}

	const handleDrop = (e: React.DragEvent) => {
		if (isLoading) return
		e.preventDefault()
		setIsDragging(false)

		const droppedFiles = Array.from(e.dataTransfer.files)
		if (droppedFiles.length > 0) {
			handleFile(droppedFiles[0])
		}
	}

	const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (isLoading) return
		const selectedFiles = e.target.files
		if (selectedFiles && selectedFiles.length > 0) {
			handleFile(selectedFiles[0])
			// Reset input value so onChange fires when selecting the same file
			if (fileInputRef.current) {
				fileInputRef.current.value = ''
			}
		}
	}

	const handleFile = async (file: File) => {
		// Verify file type
		if (!isValidFileType(file)) {
			toast.error(
				`Unsupported file format. Supported formats: ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}`
			)
			// Reset input value
			if (fileInputRef.current) {
				fileInputRef.current.value = ''
			}
			return
		}

		// Verify file size
		if (!isValidFileSize(file)) {
			toast.error(
				`File size exceeds limit. Current file: ${formatFileSize(file.size)}, max allowed: ${formatFileSize(MAX_FILE_SIZE)}`
			)
			// Reset input value
			if (fileInputRef.current) {
				fileInputRef.current.value = ''
			}
			return
		}

		setIsLoading(true)
		const uploadedFile: UploadedFile = {
			id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			name: file.name,
			size: file.size,
			type: file.type,
			file: file,
			uploadTime: new Date(),
			error: null
		}
		setSelectedFile(uploadedFile)


		try {
			const uploadParams: Parameters<typeof uploadTask>[0] = {
				file: file,
				custom_url: undefined
			}

			const response = await uploadTask(uploadParams)

			// Upload success, update state and start polling
			const taskId = String(response.task_id)

			onFileUploaded(uploadedFile)

			// Start polling task status
			if (taskId) {
				startPolling(uploadedFile.id, taskId)
			}
		} catch (error: any) {
			// Upload failed
			const errorMessage = error.response?.data?.message || error.message || 'File upload failed'
			toast.error(errorMessage)
			setSelectedFile(null)
			setIsLoading(false)
		}
	}

	// Start polling task status
	const startPolling = (fileId: string, taskId: string | number) => {
		// If already polling, stop first
		stopPolling(fileId)

		// Query once immediately
		pollTaskStatus(fileId, taskId)

		// Set interval polling, every 2 seconds
		const interval = setInterval(() => {
			pollTaskStatus(fileId, taskId)
		}, 2000)

		pollingIntervalsRef.current.set(fileId, interval)
	}

	// Stop polling
	const stopPolling = (fileId: string) => {
		const interval = pollingIntervalsRef.current.get(fileId)
		if (interval) {
			clearInterval(interval)
			pollingIntervalsRef.current.delete(fileId)
		}
	}

	// Query task status
	const pollTaskStatus = async (fileId: string, taskId: string | number) => {
		try {
			const response = await getTaskStatus(taskId)
			const { status, error_message } = response

			// Update task status (error_message corresponds to error), and save full response
			onTaskStatusChange?.({
				fileId,
				status,
				response,
				error_message
			})

			// If task is completed or failed, stop polling
			if (status === 'completed' || status === 'failed') {
				stopPolling(fileId)
				setIsLoading(false)
			}
		} catch (error: any) {
			console.error('Failed to query task status:', error)
			// Stop polling on failure to avoid infinite retries
			stopPolling(fileId)
			setIsLoading(false)
		}
	}

	// Clean up all polling intervals on unmount
	useEffect(() => {
		return () => {
			pollingIntervalsRef.current.forEach(interval => clearInterval(interval))
			pollingIntervalsRef.current.clear()
		}
	}, [])

	return (
		<div className='h-full flex flex-col bg-white dark:bg-gray-900 border-r border-border'>
			{/* File upload zone */}
			<div className='p-4'>
				<h2 className='text-lg font-semibold mb-4'>File Upload</h2>
				<div
					className={cn(
						'border-2 border-dashed rounded-lg py-8 px-4 text-center cursor-pointer transition-colors',
						isDragging
							? 'border-primary bg-primary/5'
							: 'border-gray-300 dark:border-gray-700 hover:border-primary/50'
					)}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					onClick={() => fileInputRef.current?.click()}>
					{selectedFile?.file && isLoading ? (
						<>
							<div className='flex items-start justify-center gap-2'>
								<Loader2 className='animate-spin' />
								<p className='text-sm font-medium line-clamp-2 break-all leading-6'>
									{selectedFile.name}
								</p>
							</div>
						</>
					) : (
						<>
							<Upload className='size-12 mx-auto mb-4 text-gray-400' />
							<p className='text-sm font-medium mb-1'>Click or drag file to this area</p>
							<p className='text-xs text-gray-500'>
								Format: png/jpg/jpeg, pdf
							</p>
							<p className='text-xs text-gray-400 mt-1'>Max 20MB</p>
						</>
					)}
				</div>

				<input
					ref={fileInputRef}
					type='file'
					className='hidden'
					accept='image/*,.pdf,.doc,.docx'
					disabled={isLoading}
					onChange={handleFileInput}
				/>
			</div>

			{/* Test Files Search */}
			<div className='p-4 border-t border-border flex-1 flex flex-col min-h-0'>
				<h2 className='text-sm font-semibold mb-2'>Test Files</h2>
				<input
					type="text"
					placeholder="Search input PDFs..."
					value={searchQuery}
					onChange={e => setSearchQuery(e.target.value)}
					className="w-full px-3 py-2 mb-3 border border-border rounded-md text-sm bg-transparent"
					disabled={isLoading}
				/>
				<div className="flex-1 overflow-y-auto space-y-1 pr-2">
					{filteredTestFiles.map(filename => (
						<button
							key={filename}
							onClick={() => handleTestFileSelect(filename)}
							disabled={isLoading}
							className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 truncate transition-colors disabled:opacity-50"
							title={filename}
						>
							{filename}
						</button>
					))}
					{filteredTestFiles.length === 0 && (
						<p className="text-sm text-gray-500 text-center py-4">No files found</p>
					)}
				</div>
			</div>
		</div>
	)
}
