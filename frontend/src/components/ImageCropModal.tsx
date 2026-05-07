import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { Box, Flex, Text, Spinner } from '@chakra-ui/react'
import { FiCheck, FiX, FiZoomIn, FiZoomOut } from 'react-icons/fi'
import {
  GREEN, GRAY200, GRAY400, GRAY600, GRAY800, WHITE,
} from '@/theme/tokens'

// ── Canvas crop helper ─────────────────────────────────────────────────────────
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.src = imageSrc
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width  = pixelCrop.width
  canvas.height = pixelCrop.height

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y,
    pixelCrop.width, pixelCrop.height,
    0, 0,
    pixelCrop.width, pixelCrop.height,
  )

  return canvas.toDataURL('image/jpeg', 0.92)
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface ImageCropModalProps {
  isOpen: boolean
  imageSrc: string
  aspect: number          // 1 for avatar (square), 16/3 for banner
  cropShape?: 'rect' | 'round'
  title?: string
  onConfirm: (croppedDataUrl: string) => void
  onCancel: () => void
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ImageCropModal({
  isOpen, imageSrc, aspect, cropShape = 'rect', title = 'Crop Image',
  onConfirm, onCancel,
}: ImageCropModalProps) {
  const [crop, setCrop]   = useState({ x: 0, y: 0 })
  const [zoom, setZoom]   = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return
    setProcessing(true)
    try {
      const cropped = await getCroppedImg(imageSrc, croppedAreaPixels)
      onConfirm(cropped)
    } finally {
      setProcessing(false)
    }
  }

  if (!isOpen) return null

  return (
    /* Backdrop */
    <Box
      position="fixed" inset={0} zIndex={4000}
      style={{ background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      {/* Modal */}
      <Box
        bg={WHITE} borderRadius="20px" overflow="hidden"
        style={{ width: '90vw', maxWidth: '520px', boxShadow: '0 24px 64px rgba(0,0,0,0.28)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <Flex align="center" justify="space-between"
          px={5} py={4} borderBottom={`1px solid ${GRAY200}`}>
          <Text fontSize="15px" fontWeight={700} color={GRAY800}>{title}</Text>
          <Box as="button" onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY400, padding: 4, display: 'flex' }}>
            <FiX size={18} />
          </Box>
        </Flex>

        {/* Crop area */}
        <Box position="relative" style={{ height: aspect >= 4 ? '200px' : '340px', background: '#111' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            style={{
              containerStyle: { borderRadius: 0 },
              cropAreaStyle: { border: `2px solid ${GREEN}` },
            }}
          />
        </Box>

        {/* Zoom slider */}
        <Box px={5} pt={4} pb={2}>
          <Flex align="center" gap={3}>
            <FiZoomOut size={14} color={GRAY400} />
            <Box flex={1} position="relative" h="4px" borderRadius="full"
              style={{ background: GRAY200 }}>
              <Box
                position="absolute" left={0} top={0} h="4px" borderRadius="full"
                style={{ background: GREEN, width: `${((zoom - 1) / 2) * 100}%` }} />
              <input
                type="range" min={1} max={3} step={0.05}
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  opacity: 0, cursor: 'pointer', margin: 0,
                }}
              />
            </Box>
            <FiZoomIn size={14} color={GRAY400} />
          </Flex>
          <Text fontSize="11px" color={GRAY400} textAlign="center" mt={1}>
            Scroll or drag the slider to zoom
          </Text>
        </Box>

        {/* Actions */}
        <Flex gap={2} px={5} pb={5} pt={2} justify="flex-end">
          <Box as="button" px="16px" py="8px" borderRadius="9px" fontSize="13px" fontWeight={600}
            style={{ background: 'none', border: `1px solid ${GRAY200}`, color: GRAY600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            onClick={onCancel}>
            <FiX size={13} /> Cancel
          </Box>
          <Box as="button" px="16px" py="8px" borderRadius="9px" fontSize="13px" fontWeight={600}
            style={{
              background: GREEN, color: WHITE, border: 'none',
              cursor: processing ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              opacity: processing ? 0.7 : 1,
            }}
            onClick={handleConfirm}>
            {processing ? <Spinner size="xs" color="white" /> : <FiCheck size={13} />}
            Apply Crop
          </Box>
        </Flex>
      </Box>
    </Box>
  )
}
