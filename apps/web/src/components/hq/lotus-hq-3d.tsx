'use client'

import { useRef, useEffect, useState, useCallback, Suspense, useMemo } from 'react'
import Link from 'next/link'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Html } from '@react-three/drei'
import * as THREE from 'three'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MessageCircle, Building2, Layers, Eye, ChevronRight, Activity, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================
// TYPES
// ============================================================
type AgentStatus = 'idle' | 'working' | 'thinking' | 'waiting_approval' | 'offline'
type ViewMode = 'exterior' | 'dollhouse' | 'interior'
type Connection = 'connecting' | 'live' | 'offline'

interface Agent {
  id: string
  name: string
  role: string
  departmentId: string
  status: AgentStatus
  currentTask: string | null
  currentMission: string | null
  tasksCompleted: number
  tasksPending: number
  lastActivity: string[]
}

interface FeedItem {
  id: string
  agentName: string
  role: string
  departmentId: string
  action: string
  time: string
}

const VALID_STATUSES: AgentStatus[] = ['idle', 'working', 'thinking', 'waiting_approval', 'offline']

// ============================================================
// CONSTANTS
// ============================================================
const BW = 24, BD = 16, FH = 4, NF = 7

interface DeptDef {
  id: string; name: string; floor: number; color: string; side: 'left' | 'right' | 'full'; icon: string
}

const DEPTS: DeptDef[] = [
  { id: 'mission-control', name: 'Mission Control',       floor: 0, color: '#22c55e', side: 'full',  icon: '🎯' },
  { id: 'web-dev',         name: 'Web Development',       floor: 1, color: '#3b82f6', side: 'left',  icon: '💻' },
  { id: 'data-analytics',  name: 'Data & Analytics',      floor: 1, color: '#a855f7', side: 'right', icon: '📊' },
  { id: 'sales',           name: 'Sales & CS',            floor: 2, color: '#06b6d4', side: 'full',  icon: '💼' },
  { id: 'performance',     name: 'Performance Marketing', floor: 3, color: '#10b981', side: 'left',  icon: '📈' },
  { id: 'bto',             name: 'Business Transformation Office', floor: 3, color: '#38bdf8', side: 'right', icon: '⚙️' },
  { id: 'copywriting',     name: 'Copywriting',           floor: 4, color: '#f97316', side: 'left',  icon: '✍️' },
  { id: 'creative',        name: 'Creative Studio',       floor: 4, color: '#ef4444', side: 'right', icon: '🎨' },
  { id: 'bi',              name: 'Business Intelligence', floor: 5, color: '#6366f1', side: 'left',  icon: '🔭' },
  { id: 'strategy',        name: 'Strategy',              floor: 5, color: '#8b5cf6', side: 'right', icon: '🧠' },
  { id: 'root-master',     name: 'Root Master',           floor: 6, color: '#ec4899', side: 'left',  icon: '🌸' },
  { id: 'ceo',             name: 'CEO Office',            floor: 6, color: '#f59e0b', side: 'right', icon: '👑' },
]

const FLOOR_NAMES = ['Mission Control', 'Operations', 'Commercial', 'Marketing & Transformação', 'Creative', 'Intelligence', 'Executive']

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: '#6b7280', working: '#22c55e', waiting_approval: '#f59e0b', thinking: '#3b82f6', offline: '#374151',
}
const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Disponível', working: 'Trabalhando', waiting_approval: 'Aguardando aprovação', thinking: 'Na fila', offline: 'Offline',
}

// ============================================================
// HELPERS
// ============================================================
const getDeptColor = (id: string) => DEPTS.find(d => d.id === id)?.color ?? '#6b7280'
const getFloorY = (lvl: number) => lvl * FH + 0.15

function seededVal(seed: string, offset = 0) {
  let h = offset * 2654435761
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 2654435761)
  return Math.abs(h % 1000) / 1000
}

const SKIN_TONES = ['#f5d6b8', '#e8b89a', '#d4a574', '#c68642', '#8d5524', '#f1c27d']
const HAIR_COLORS = ['#1a0a00', '#3b1f0a', '#8B4513', '#c8a96e', '#2c2c2c', '#1a1a1a']

const getSkinTone = (id: string) => SKIN_TONES[Math.floor(seededVal(id, 1) * SKIN_TONES.length)]
const getHairColor = (id: string) => HAIR_COLORS[Math.floor(seededVal(id, 2) * HAIR_COLORS.length)]

// Cadeiras por departamento [x, z] — referência bx=0 (centro do prédio)
// Espelha as posições reais do DeptFurniture (que também usa bx=0)
const DEPT_CHAIRS: Record<string, Array<[number, number]>> = {
  'mission-control': [[-8, -4.8], [-4, -4.8], [0, -4.8], [4, -4.8], [8, -4.8]],
  'web-dev':         [[-10, -4.8], [-7, -4.8], [-10, -1.3]],
  'data-analytics':  [[4, -4.8], [7.5, -4.8], [4, -1.3]],
  'sales':           [[-8, -4.8], [-4, -4.8], [0, -4.8], [4, -4.8], [8, -4.8]],
  'performance':     [[-10, -4.8], [-7, -4.8], [-10, -1.3]],
  'bto':             [[4, -4.8], [7.5, -4.8], [4, -1.3]],
  'copywriting':     [[-10, -4.8], [-7, -4.8], [-10, -1.3]],
  'creative':        [[4, -4.8], [7.5, -4.8], [4, -1.3]],
  'bi':              [[-10, -4.8], [-7, -4.8], [-10, -1.3]],
  'strategy':        [[4, -4.8], [7.5, -3.3]],
  'root-master':     [[-10, -0.8], [-7, -0.8]],
  // 2º lugar: cadeira da mesa de reunião do CEO Office (LOTUS AI CEO)
  'ceo':             [[8, -1.6], [7, 4]],
}

interface AgentPlacement { pos: THREE.Vector3; seated: boolean }

// Posição de cada agente calculada a partir da lista AO VIVO do seu departamento.
// Quem tem cadeira senta; excedentes e quem está na fila/aguardando ficam em pé.
function getAgentPlacement(agent: Agent, agents: Agent[]): AgentPlacement {
  const dept = DEPTS.find(d => d.id === agent.departmentId)
  const peers = agents
    .filter(a => a.departmentId === agent.departmentId)
    .sort((a, b) => a.id.localeCompare(b.id))
  const idx = Math.max(peers.findIndex(a => a.id === agent.id), 0)

  if (!dept) {
    // Departamento sem sala: fica em pé no lobby do térreo
    return {
      pos: new THREE.Vector3(-9 + (idx % 10) * 2, getFloorY(0) + 0.1, 6.2 - Math.floor(idx / 10) * 1.3),
      seated: false,
    }
  }

  const floorY = getFloorY(dept.floor)
  const chairs = DEPT_CHAIRS[dept.id] ?? []

  if (idx < chairs.length) {
    const [cx, cz] = chairs[idx]
    const seated = agent.status === 'idle' || agent.status === 'working'
    // Em pé: um passo atrás da cadeira para não atravessar o móvel
    return { pos: new THREE.Vector3(cx, floorY + (seated ? 0.44 : 0.1), seated ? cz : cz + 0.9), seated }
  }

  // Mais agentes que cadeiras: distribui em pé na área livre da sala, sem sobrepor
  const extra = idx - chairs.length
  const xOff = dept.side === 'full' ? 0 : dept.side === 'left' ? -6 : 6
  const perRow = dept.side === 'full' ? 8 : 4
  const col = extra % perRow
  const row = Math.floor(extra / perRow)
  return {
    pos: new THREE.Vector3(xOff + (col - (perRow - 1) / 2) * 1.5, floorY + 0.1, 1.6 + row * 1.3),
    seated: false,
  }
}

// ============================================================
// BUILDING PIECES
// ============================================================
function FloorSlab({ level, opacity = 1 }: { level: number; opacity?: number }) {
  return (
    <mesh position={[0, level * FH - 0.08, 0]} receiveShadow>
      <boxGeometry args={[BW, 0.16, BD]} />
      <meshStandardMaterial color="#1a1a2e" transparent opacity={opacity} />
    </mesh>
  )
}

function StructuralColumn({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, (NF * FH) / 2, z]} castShadow>
      <boxGeometry args={[0.35, NF * FH, 0.35]} />
      <meshStandardMaterial color="#252545" metalness={0.7} roughness={0.3} />
    </mesh>
  )
}

function GlassPanel({ position, rotation, w, h, opacity = 0.11 }: {
  position: [number, number, number]; rotation: [number, number, number]; w: number; h: number; opacity?: number
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[w, h]} />
      <meshPhysicalMaterial transparent opacity={opacity} roughness={0.02} metalness={0.25} color="#7799cc" side={THREE.DoubleSide} />
    </mesh>
  )
}

function Staircase({ floorLevel }: { floorLevel: number }) {
  const baseY = getFloorY(floorLevel)
  const steps = 12
  const stepH = FH / steps
  const stepD = (BD / 4) / steps
  return (
    <group position={[BW / 2 - 2.5, baseY, BD / 2 - 3.5]}>
      {Array.from({ length: steps }, (_, i) => (
        <mesh key={i} position={[0, i * stepH + stepH / 2, -i * stepD - stepD / 2]}>
          <boxGeometry args={[2.2, stepH, stepD + 0.05]} />
          <meshStandardMaterial color="#1e1e3a" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[1.05, FH / 2, -BD / 8]}>
        <boxGeometry args={[0.05, 0.05, BD / 4 + 0.3]} />
        <meshStandardMaterial color="#555" metalness={0.7} />
      </mesh>
    </group>
  )
}

function ElevatorShaft() {
  const h = NF * FH
  return (
    <group position={[-BW / 2 + 2.5, h / 2, -BD / 2 + 2.5]}>
      <mesh position={[0, 0, -1.1]}>
        <boxGeometry args={[2.4, h, 0.08]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      <mesh position={[-1.1, 0, 0]}>
        <boxGeometry args={[0.08, h, 2.4]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      <mesh position={[1.1, 0, 0]}>
        <boxGeometry args={[0.08, h, 2.4]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      <mesh position={[0, -h / 2 + 2, 0]}>
        <boxGeometry args={[2.0, 3.6, 2.0]} />
        <meshStandardMaterial color="#252545" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, -h / 2 + 2, 1.05]}>
        <planeGeometry args={[1.8, 3.2]} />
        <meshStandardMaterial color="#ec4899" emissive="#ec4899" emissiveIntensity={0.15} transparent opacity={0.4} />
      </mesh>
    </group>
  )
}

// ============================================================
// FURNITURE PIECES
// ============================================================
function Desk({ pos, rot = 0, type = 'standard', screenColor = '#0a84ff' }: { pos: [number, number, number]; rot?: number; type?: string; screenColor?: string }) {
  const tableColor = type === 'executive' ? '#5D3A1A' : type === 'standing' ? '#888' : '#c8a96e'
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      {/* Tampa da mesa */}
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.05, 0.65]} />
        <meshStandardMaterial color={tableColor} roughness={0.5} />
      </mesh>
      {/* Pernas */}
      {([-0.58, 0.58] as number[]).flatMap(lx =>
        ([-0.28, 0.28] as number[]).map(lz => (
          <mesh key={`${lx}${lz}`} position={[lx, 0.35, lz]}>
            <cylinderGeometry args={[0.035, 0.035, 0.7, 5]} />
            <meshStandardMaterial color="#888" metalness={0.7} />
          </mesh>
        ))
      )}
      {/* Monitor — carcaça */}
      <mesh position={[0, 1.34, -0.21]} castShadow>
        <boxGeometry args={[0.78, 0.50, 0.045]} />
        <meshStandardMaterial color="#0d0d0d" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Tela do monitor — emissiva e colorida por dept */}
      <mesh position={[0, 1.34, -0.183]}>
        <planeGeometry args={[0.70, 0.43]} />
        <meshStandardMaterial color={screenColor} emissive={screenColor} emissiveIntensity={2.2} />
      </mesh>
      {/* Suporte do monitor */}
      <mesh position={[0, 1.02, -0.21]}>
        <boxGeometry args={[0.07, 0.32, 0.05]} />
        <meshStandardMaterial color="#444" metalness={0.7} />
      </mesh>
      {/* Base do suporte */}
      <mesh position={[0, 0.86, -0.21]}>
        <boxGeometry args={[0.26, 0.03, 0.14]} />
        <meshStandardMaterial color="#333" metalness={0.7} />
      </mesh>
      {/* Teclado */}
      <mesh position={[0, 0.785, -0.04]}>
        <boxGeometry args={[0.48, 0.015, 0.19]} />
        <meshStandardMaterial color="#222" roughness={0.8} />
      </mesh>
      {/* Mouse */}
      <mesh position={[0.32, 0.785, -0.04]}>
        <boxGeometry args={[0.09, 0.015, 0.14]} />
        <meshStandardMaterial color="#222" roughness={0.7} />
      </mesh>
    </group>
  )
}

function Chair({ pos, rot = 0 }: { pos: [number, number, number]; rot?: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.44, 0]}>
        <boxGeometry args={[0.47, 0.055, 0.46]} />
        <meshStandardMaterial color="#2d2d4a" />
      </mesh>
      <mesh position={[0, 0.74, -0.19]}>
        <boxGeometry args={[0.47, 0.54, 0.055]} />
        <meshStandardMaterial color="#2d2d4a" />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.4, 5]} />
        <meshStandardMaterial color="#555" metalness={0.8} />
      </mesh>
    </group>
  )
}

function ServerRack({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.5, 2.0, 0.6]} />
        <meshStandardMaterial color="#111827" metalness={0.6} roughness={0.4} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[0.18, 0.2 + i * 0.3, -0.28]}>
          <boxGeometry args={[0.07, 0.07, 0.07]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1} />
        </mesh>
      ))}
    </group>
  )
}

function Whiteboard({ pos, rot = 0, color = '#1e293b', label = '' }: { pos: [number, number, number]; rot?: number; color?: string; label?: string }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      {/* Moldura */}
      <mesh>
        <boxGeometry args={[2.7, 1.6, 0.06]} />
        <meshStandardMaterial color="#222" metalness={0.5} />
      </mesh>
      {/* Superfície da lousa */}
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[2.5, 1.4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.95} />
      </mesh>
      {/* Linhas simulando escrita */}
      {[-0.3, 0, 0.3].map((dy, i) => (
        <mesh key={i} position={[0, dy, 0.038]}>
          <planeGeometry args={[2.0, 0.025]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} transparent opacity={0.25} />
        </mesh>
      ))}
    </group>
  )
}

// Parede de sala com janela e poster decorativo
function RoomWall({ pos, w, h, rot = 0, wallColor, accentColor = '#4466ff' }: {
  pos: [number, number, number]; w: number; h: number; rot?: number; wallColor: string; accentColor?: string
}) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      {/* Parede base — leve emissive para ser visível mesmo em sombra */}
      <mesh receiveShadow>
        <boxGeometry args={[w, h, 0.09]} />
        <meshStandardMaterial color={wallColor} emissive={wallColor} emissiveIntensity={0.7} roughness={0.88} />
      </mesh>
      {/* Faixa de rodapé */}
      <mesh position={[0, -h / 2 + 0.1, 0.05]}>
        <boxGeometry args={[w, 0.2, 0.02]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.3} />
      </mesh>
      {/* Faixa no topo */}
      <mesh position={[0, h / 2 - 0.08, 0.05]}>
        <boxGeometry args={[w, 0.12, 0.02]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.25} />
      </mesh>
    </group>
  )
}

// Divisória semi-transparente entre departamentos do mesmo andar
function RoomDivider({ x, floorY }: { x: number; floorY: number }) {
  return (
    <group position={[x, floorY + FH / 2, 0]}>
      <mesh>
        <boxGeometry args={[0.07, FH - 0.3, BD - 1]} />
        <meshStandardMaterial color="#1a1a3a" roughness={0.7} />
      </mesh>
      {/* Vidro na parte superior da divisória */}
      <mesh position={[0, FH * 0.18, 0]}>
        <boxGeometry args={[0.04, FH * 0.4, BD - 1.5]} />
        <meshPhysicalMaterial transparent opacity={0.18} roughness={0.05} color="#88aacc" />
      </mesh>
    </group>
  )
}

// Tapete para área de trabalho
function AreaRug({ pos, w, d, color }: { pos: [number, number, number]; w: number; d: number; color: string }) {
  return (
    <mesh position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={1} />
    </mesh>
  )
}

// Quadro decorativo na parede
function WallArt({ pos, w = 1.2, h = 0.8, bgColor, rot = 0 }: { pos: [number, number, number]; w?: number; h?: number; bgColor: string; rot?: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      {/* Moldura */}
      <mesh>
        <boxGeometry args={[w + 0.1, h + 0.1, 0.04]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.5} />
      </mesh>
      {/* Tela do quadro */}
      <mesh position={[0, 0, 0.025]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={bgColor} emissive={bgColor} emissiveIntensity={0.15} roughness={0.9} />
      </mesh>
    </group>
  )
}

function Sofa({ pos, rot = 0 }: { pos: [number, number, number]; rot?: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[1.8, 0.4, 0.7]} />
        <meshStandardMaterial color="#2d2d4a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.75, -0.3]}>
        <boxGeometry args={[1.8, 0.65, 0.15]} />
        <meshStandardMaterial color="#2d2d4a" roughness={0.9} />
      </mesh>
      {([-0.82, 0.82] as number[]).map(x => (
        <mesh key={x} position={[x, 0.6, -0.15]}>
          <boxGeometry args={[0.16, 0.65, 0.65]} />
          <meshStandardMaterial color="#252545" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function Plant({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.14, 0.09, 0.4, 7]} />
        <meshStandardMaterial color="#7B4513" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.63, 0]}>
        <sphereGeometry args={[0.33, 8, 6]} />
        <meshStandardMaterial color="#2d7a2d" roughness={0.9} />
      </mesh>
    </group>
  )
}

function MeetingTable({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <cylinderGeometry args={[1.75, 1.75, 0.07, 22]} />
        <meshStandardMaterial color="#5D3A1A" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 0.74, 6]} />
        <meshStandardMaterial color="#888" metalness={0.8} />
      </mesh>
    </group>
  )
}

function LightFixture({ pos, color = '#fffde0' }: { pos: [number, number, number]; color?: string }) {
  return (
    <group position={pos}>
      <mesh>
        <boxGeometry args={[0.7, 0.06, 0.7]} />
        <meshStandardMaterial color="#1a1a2e" metalness={0.6} />
      </mesh>
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[0.62, 0.025, 0.62]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5.0} />
      </mesh>
      <pointLight position={[0, -0.1, 0]} color={color} intensity={1.8} distance={9} decay={2} />
    </group>
  )
}

// Cor de tela por departamento
const SCREEN_COLORS: Record<string, string> = {
  'mission-control': '#00e676', 'web-dev': '#0a84ff', 'data-analytics': '#c678ff',
  'sales': '#00e5ff', 'performance': '#00e676', 'bto': '#38bdf8', 'copywriting': '#ff9a3c',
  'creative': '#ff5a5a', 'bi': '#4d7cff', 'strategy': '#9d6cff',
  'root-master': '#ff79c6', 'ceo': '#ffc107',
}

// ============================================================
// DEPARTMENT ROOMS — ÚNICO POR DEPARTAMENTO
// ============================================================
function DeptFurniture({ dept, bx, by }: { dept: DeptDef; bx: number; by: number }) {
  const sc = SCREEN_COLORS[dept.id] ?? '#0a84ff'
  switch (dept.id) {
    case 'mission-control':
      return <>
        <MeetingTable pos={[bx, by, -0.5]} />
        {[0, 60, 120, 180, 240, 300].map((a, i) => (
          <Chair key={i} pos={[bx + Math.cos(a * Math.PI / 180) * 2.3, by, -0.5 + Math.sin(a * Math.PI / 180) * 2.3]} />
        ))}
        {[-8, -4, 0, 4, 8].map(x => <Desk key={x} pos={[bx + x, by, -5.5]} screenColor={sc} />)}
        {[-8, -4, 0, 4, 8].map(x => <Chair key={x + 100} pos={[bx + x, by, -4.8]} rot={Math.PI} />)}
        {[-6, -2, 2, 6].map(x => <Whiteboard key={x} pos={[bx + x, by + 2.2, BD / 2 - 0.6]} color="#0a2a0a" />)}
        <Plant pos={[bx - 10.5, by, 6]} />
        <Plant pos={[bx + 10.5, by, 6]} />
      </>

    case 'web-dev':
      return <>
        <Desk pos={[bx - 10, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx - 10, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx - 7, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx - 7, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx - 10, by, -2]} screenColor={sc} />
        <Chair pos={[bx - 10, by, -1.3]} rot={Math.PI} />
        <ServerRack pos={[bx - 11.5, by, 4]} />
        <ServerRack pos={[bx - 10, by, 4]} />
        <Whiteboard pos={[bx - 7, by + 2.2, BD / 2 - 0.6]} color="#081630" />
        <Plant pos={[bx - 11.5, by, -6.5]} />
        <Plant pos={[bx - 8.5, by, 6]} />
      </>

    case 'data-analytics':
      return <>
        <Desk pos={[bx + 4, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx + 4, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx + 7.5, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx + 7.5, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx + 4, by, -2]} screenColor={sc} />
        <Chair pos={[bx + 4, by, -1.3]} rot={Math.PI} />
        <Whiteboard pos={[bx + 6, by + 2.2, BD / 2 - 0.6]} color="#180530" />
        <Plant pos={[bx + 10.5, by, -6.5]} />
      </>

    case 'sales':
      return <>
        {[-8, -4, 0, 4, 8].map((x, i) => (
          <group key={i}>
            <Desk pos={[bx + x, by, -5.5]} screenColor={sc} />
            <Chair pos={[bx + x, by, -4.8]} rot={Math.PI} />
          </group>
        ))}
        <MeetingTable pos={[bx, by, 4.5]} />
        {[0, 60, 120, 180, 240, 300].map((a, i) => (
          <Chair key={i} pos={[bx + Math.cos(a * Math.PI / 180) * 2.2, by, 4.5 + Math.sin(a * Math.PI / 180) * 2.2]} />
        ))}
        <Sofa pos={[bx - 9, by, 5.5]} />
        <Plant pos={[bx + 10.5, by, 6]} />
        <Plant pos={[bx - 10.5, by, 6]} />
      </>

    case 'performance':
      return <>
        <Desk pos={[bx - 10, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx - 10, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx - 7, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx - 7, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx - 10, by, -2]} screenColor={sc} />
        <Chair pos={[bx - 10, by, -1.3]} rot={Math.PI} />
        <Whiteboard pos={[bx - 9, by + 2.2, BD / 2 - 0.6]} color="#08200e" />
        <Whiteboard pos={[bx - 5, by + 2.2, BD / 2 - 0.6]} color="#08200e" />
        <MeetingTable pos={[bx - 5, by, 3.8]} />
        {[0, 90, 180, 270].map((a, i) => (
          <Chair key={i} pos={[bx - 5 + Math.cos(a * Math.PI / 180) * 2, by, 3.8 + Math.sin(a * Math.PI / 180) * 2]} />
        ))}
        <Plant pos={[bx - 11.5, by, 6]} />
      </>

    case 'bto':
      return <>
        <Desk pos={[bx + 4, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx + 4, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx + 7.5, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx + 7.5, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx + 4, by, -2]} screenColor={sc} />
        <Chair pos={[bx + 4, by, -1.3]} rot={Math.PI} />
        <ServerRack pos={[bx + 11, by, -5]} />
        <Whiteboard pos={[bx + 4.5, by + 2.2, BD / 2 - 0.6]} color="#04202e" />
        <Whiteboard pos={[bx + 8.5, by + 2.2, BD / 2 - 0.6]} color="#04202e" />
        <Sofa pos={[bx + 10, by, 3.5]} rot={-Math.PI / 2} />
        <Plant pos={[bx + 10.5, by, 6]} />
        <Plant pos={[bx + 2.5, by, 6]} />
      </>

    case 'copywriting':
      return <>
        <Desk pos={[bx - 10, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx - 10, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx - 7, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx - 7, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx - 10, by, -2]} screenColor={sc} />
        <Chair pos={[bx - 10, by, -1.3]} rot={Math.PI} />
        <Sofa pos={[bx - 8.5, by, 4.5]} rot={Math.PI} />
        <Whiteboard pos={[bx - 8, by + 2.2, BD / 2 - 0.6]} color="#2a1008" />
        {/* Estante de livros */}
        <mesh position={[bx - 11.5, by + 1.2, 3]}>
          <boxGeometry args={[0.3, 2.4, 1.8]} />
          <meshStandardMaterial color="#3D2B1F" roughness={0.9} />
        </mesh>
        <Plant pos={[bx - 11.5, by, -6.5]} />
      </>

    case 'creative':
      return <>
        <Desk pos={[bx + 4, by, -5.5]} type="standing" screenColor={sc} />
        <Chair pos={[bx + 4, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx + 7.5, by, -5.5]} type="standing" screenColor={sc} />
        <Chair pos={[bx + 7.5, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx + 4, by, -2]} type="standing" screenColor={sc} />
        <Chair pos={[bx + 4, by, -1.3]} rot={Math.PI} />
        <Whiteboard pos={[bx + 6, by + 2.2, BD / 2 - 0.6]} color="#280028" />
        <Sofa pos={[bx + 10, by, 4.5]} rot={-Math.PI / 2} />
        <Plant pos={[bx + 10.5, by, -6.5]} />
        <Plant pos={[bx + 2.5, by, 6]} />
      </>

    case 'bi':
      return <>
        <Desk pos={[bx - 10, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx - 10, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx - 7, by, -5.5]} screenColor={sc} />
        <Chair pos={[bx - 7, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx - 10, by, -2]} screenColor={sc} />
        <Chair pos={[bx - 10, by, -1.3]} rot={Math.PI} />
        <Whiteboard pos={[bx - 9, by + 2.2, BD / 2 - 0.6]} color="#04102a" />
        <Whiteboard pos={[bx - 5, by + 2.2, BD / 2 - 0.6]} color="#04102a" />
        <Plant pos={[bx - 11.5, by, 6]} />
      </>

    case 'strategy':
      return <>
        <Desk pos={[bx + 4, by, -5.5]} type="executive" screenColor={sc} />
        <Chair pos={[bx + 4, by, -4.8]} rot={Math.PI} />
        <Desk pos={[bx + 7.5, by, -4]} type="executive" screenColor={sc} rot={-Math.PI / 6} />
        <Chair pos={[bx + 7.5, by, -3.3]} rot={Math.PI} />
        <Whiteboard pos={[bx + 6, by + 2.2, BD / 2 - 0.6]} color="#0a0030" />
        <MeetingTable pos={[bx + 6, by, 3.5]} />
        {[0, 90, 180, 270].map((a, i) => (
          <Chair key={i} pos={[bx + 6 + Math.cos(a * Math.PI / 180) * 2, by, 3.5 + Math.sin(a * Math.PI / 180) * 2]} />
        ))}
        <Plant pos={[bx + 10.5, by, 6]} />
      </>

    case 'root-master':
      return <>
        <ServerRack pos={[bx - 11, by, -5]} />
        <ServerRack pos={[bx - 9.5, by, -5]} />
        <ServerRack pos={[bx - 8, by, -5]} />
        <ServerRack pos={[bx - 6.5, by, -5]} />
        <Desk pos={[bx - 10, by, -1.5]} type="executive" screenColor={sc} />
        <Chair pos={[bx - 10, by, -0.8]} rot={Math.PI} />
        <Desk pos={[bx - 7, by, -1.5]} screenColor={sc} />
        <Chair pos={[bx - 7, by, -0.8]} rot={Math.PI} />
        <Whiteboard pos={[bx - 8, by + 2.2, BD / 2 - 0.6]} color="#300040" />
        <Plant pos={[bx - 11.5, by, 5]} />
      </>

    case 'ceo':
      return <>
        <Desk pos={[bx + 8, by, -2.5]} type="executive" screenColor={sc} rot={Math.PI / 8} />
        <Chair pos={[bx + 8, by, -1.6]} rot={Math.PI} />
        <MeetingTable pos={[bx + 5, by, 4]} />
        {[0, 60, 120, 180, 240, 300].map((a, i) => (
          <Chair key={i} pos={[bx + 5 + Math.cos(a * Math.PI / 180) * 2, by, 4 + Math.sin(a * Math.PI / 180) * 2]} />
        ))}
        <Sofa pos={[bx + 10, by, 1.5]} rot={-Math.PI / 2} />
        {/* Parede de vidro estilo CEO */}
        <Plant pos={[bx + 2.5, by, -6.5]} />
        <Plant pos={[bx + 10.5, by, 6]} />
        <Plant pos={[bx + 2.5, by, 6]} />
      </>

    default:
      return null
  }
}

function DeptRoom({ dept, floorY }: { dept: DeptDef; floorY: number }) {
  const c = dept.color
  const isFull = dept.side === 'full'
  const isLeft = dept.side === 'left'
  const xOff = isFull ? 0 : isLeft ? -6 : 6
  const floorW = isFull ? BW - 0.3 : BW / 2 - 0.5
  const wallH = FH - 0.2

  // PISO — tint suave da cor do dept (40% saturação)
  const floorColor = ({
    'mission-control': '#123820', 'web-dev': '#0e1e52', 'data-analytics': '#220854',
    'sales': '#0c3e3e', 'performance': '#0a3020', 'bto': '#0a2c44', 'copywriting': '#3e1808',
    'creative': '#3e0a1a', 'bi': '#080e52', 'strategy': '#120452',
    'root-master': '#320054', 'ceo': '#3e2206',
  } as Record<string, string>)[dept.id] ?? '#10103e'

  // PAREDE — 50% da cor do dept, bem saturada e claramente colorida
  const wallColor = ({
    'mission-control': '#145a2c', 'web-dev': '#1a4d8a', 'data-analytics': '#4a2070',
    'sales': '#065a62', 'performance': '#0a5038', 'bto': '#0e4a70', 'copywriting': '#6a3010',
    'creative': '#6a2020', 'bi': '#2c2e70', 'strategy': '#3e2870',
    'root-master': '#6a2244', 'ceo': '#6a4408',
  } as Record<string, string>)[dept.id] ?? '#181868'

  // TAPETE — 60% da cor do dept, mais saturado que o piso
  const rugColor = ({
    'mission-control': '#186634', 'web-dev': '#1e58a0', 'data-analytics': '#562680',
    'sales': '#086e78', 'performance': '#0c5e44', 'bto': '#125c8a', 'copywriting': '#7a3814',
    'creative': '#7a2828', 'bi': '#323880', 'strategy': '#483282',
    'root-master': '#7c284e', 'ceo': '#7c5010',
  } as Record<string, string>)[dept.id] ?? '#1e1e78'

  // Número de fixtures
  const fxCount = isFull ? 5 : 3
  const fxSpacing = isFull ? 4 : 2.5
  const fxStart = isFull ? -8 : -2.5

  return (
    <group>
      {/* PISO */}
      <mesh position={[xOff, floorY + 0.002, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[floorW, BD - 0.3]} />
        <meshStandardMaterial color={floorColor} emissive={floorColor} emissiveIntensity={0.45} roughness={0.75} />
      </mesh>

      {/* TAPETE central — delimita a área de trabalho */}
      <AreaRug pos={[xOff, floorY + 0.012, 0]} w={floorW * 0.72} d={BD * 0.6} color={rugColor} />

      {/* PAREDE de fundo (traseira) */}
      <RoomWall
        pos={[xOff, floorY + wallH / 2, -BD / 2 + 0.06]}
        w={floorW - 0.2} h={wallH}
        wallColor={wallColor} accentColor={c}
      />

      {/* PAREDE frontal (vidro da fachada já existe) */}

      {/* PAREDES LATERAIS para salas half */}
      {!isFull && (
        <RoomWall
          pos={[isFull ? 0 : isLeft ? -BW / 2 + 0.06 : BW / 2 - 0.06, floorY + wallH / 2, 0]}
          w={BD - 0.2} h={wallH} rot={Math.PI / 2}
          wallColor={wallColor} accentColor={c}
        />
      )}

      {/* TETO */}
      <mesh position={[xOff, floorY + FH - 0.09, 0]}>
        <boxGeometry args={[floorW - 0.1, 0.05, BD - 0.3]} />
        <meshStandardMaterial color="#1a1a2e" emissive="#0d0d20" emissiveIntensity={0.4} roughness={1} />
      </mesh>

      {/* Faixa de acento no teto — bem visível */}
      <mesh position={[xOff, floorY + FH - 0.075, 0]}>
        <boxGeometry args={[floorW - 0.6, 0.04, 0.5]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.5} />
      </mesh>

      {/* LUMINÁRIAS DE TETO — mais brilhantes */}
      {Array.from({ length: fxCount }, (_, i) => (
        <LightFixture key={i} pos={[xOff + fxStart + i * fxSpacing, floorY + FH - 0.14, 0]} color="#fffde8" />
      ))}

      {/* Luz principal do dept — bem mais forte */}
      <pointLight position={[xOff, floorY + 3.2, 0]} color="#ffffff" intensity={3.0} distance={16} decay={1.8} />
      {/* Luz colorida do dept — acento */}
      <pointLight position={[xOff, floorY + 2.0, 0]} color={c} intensity={1.5} distance={12} decay={2} />
      {/* Luz fill traseira */}
      <pointLight position={[xOff, floorY + 1.5, -4]} color="#ffffff" intensity={1.2} distance={10} decay={2} />
      {/* Luz fill frontal */}
      <pointLight position={[xOff, floorY + 1.5, 4]} color="#ffffff" intensity={1.0} distance={10} decay={2} />
      {/* Luz extra para andares superiores (menos incidência de luz global) */}
      {dept.floor >= 5 && (
        <pointLight position={[xOff, floorY + 2.6, 0]} color="#fffff0" intensity={2.2} distance={14} decay={2} />
      )}

      {/* QUADROS DECORATIVOS na parede de fundo */}
      <WallArt pos={[xOff - floorW * 0.28, floorY + 2.4, -BD / 2 + 0.16]} w={1.1} h={0.75} bgColor={c} />
      <WallArt pos={[xOff + floorW * 0.28, floorY + 2.4, -BD / 2 + 0.16]} w={1.1} h={0.75} bgColor={c} />

      {/* MÓVEIS do departamento — bx=0 para alinhar com DEPT_CHAIRS lookup table */}
      <DeptFurniture dept={dept} bx={0} by={floorY} />
    </group>
  )
}

// ============================================================
// CHARACTER 3D — COM ANIMAÇÕES DE SENTAR E CAMINHAR
// ============================================================
interface CharProps {
  agent: Agent
  targetPos: THREE.Vector3
  seated: boolean
  onSelect: (a: Agent) => void
  selected: boolean
}

function Character3D({ agent, targetPos, seated, onSelect, selected }: CharProps) {
  const root = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Mesh>(null!)
  const lArmGroup = useRef<THREE.Group>(null!)
  const rArmGroup = useRef<THREE.Group>(null!)
  const lLegGroup = useRef<THREE.Group>(null!)
  const rLegGroup = useRef<THREE.Group>(null!)

  const curPos = useRef(targetPos.clone())
  const offsetY = useRef(0)
  const phase = useMemo(() => seededVal(agent.id, 9) * Math.PI * 2, [agent.id])

  const skin = useMemo(() => getSkinTone(agent.id), [agent.id])
  const hair = useMemo(() => getHairColor(agent.id), [agent.id])
  const shirt = useMemo(() => getDeptColor(agent.departmentId), [agent.departmentId])
  const statusC = STATUS_COLOR[agent.status]

  // Senta apenas quem tem cadeira própria e está disponível/trabalhando (definido pelo placement)
  const isSitting = seated
  // Na fila ou aguardando aprovação: em pé, animação de "pensando"
  const isPondering = agent.status === 'thinking' || agent.status === 'waiting_approval'

  useFrame(state => {
    if (!root.current) return
    const t = state.clock.elapsedTime + phase

    const prevPos = curPos.current.clone()
    curPos.current.lerp(targetPos, 0.025)
    const dist = curPos.current.distanceTo(targetPos)
    const velocity = curPos.current.distanceTo(prevPos)
    const isMoving = velocity > 0.003 && dist > 0.3

    const targetOffsetY = isSitting ? -0.42 : 0
    offsetY.current = THREE.MathUtils.lerp(offsetY.current, targetOffsetY, 0.06)
    root.current.position.set(curPos.current.x, curPos.current.y + offsetY.current, curPos.current.z)

    if (isMoving) {
      const dir = targetPos.clone().sub(curPos.current)
      if (dir.length() > 0.01) {
        const angle = Math.atan2(dir.x, dir.z)
        root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, angle, 0.12)
      }
    } else if (isSitting) {
      // Face the monitor (toward -Z in local desk space, which is rotation.y = Math.PI)
      root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, Math.PI, 0.04)
    }

    if (agent.status === 'offline') return

    if (isMoving) {
      if (lLegGroup.current) lLegGroup.current.rotation.x = Math.sin(t * 9) * 0.45
      if (rLegGroup.current) rLegGroup.current.rotation.x = Math.sin(t * 9 + Math.PI) * 0.45
      if (lArmGroup.current) lArmGroup.current.rotation.x = Math.sin(t * 9 + Math.PI) * 0.35
      if (rArmGroup.current) rArmGroup.current.rotation.x = Math.sin(t * 9) * 0.35
      if (head.current) head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, 0, 0.06)
    } else if (isSitting) {
      if (lLegGroup.current) lLegGroup.current.rotation.x = THREE.MathUtils.lerp(lLegGroup.current.rotation.x, 0.95, 0.06)
      if (rLegGroup.current) rLegGroup.current.rotation.x = THREE.MathUtils.lerp(rLegGroup.current.rotation.x, 0.95, 0.06)

      if (agent.status === 'working') {
        // Typing animation
        if (lArmGroup.current) lArmGroup.current.rotation.x = THREE.MathUtils.lerp(lArmGroup.current.rotation.x, -1.1 + Math.sin(t * 6) * 0.07, 0.05)
        if (rArmGroup.current) rArmGroup.current.rotation.x = THREE.MathUtils.lerp(rArmGroup.current.rotation.x, -1.1 + Math.sin(t * 6 + 1) * 0.07, 0.05)
        if (head.current) head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, -0.2, 0.05)
      } else {
        // Idle at desk — relaxed arms, slight head bob
        if (head.current) head.current.rotation.y = Math.sin(t * 0.4) * 0.08
        if (head.current) head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, -0.1, 0.03)
        if (lArmGroup.current) lArmGroup.current.rotation.x = THREE.MathUtils.lerp(lArmGroup.current.rotation.x, -0.6, 0.05)
        if (rArmGroup.current) rArmGroup.current.rotation.x = THREE.MathUtils.lerp(rArmGroup.current.rotation.x, -0.6, 0.05)
      }
    } else {
      if (lLegGroup.current) lLegGroup.current.rotation.x = THREE.MathUtils.lerp(lLegGroup.current.rotation.x, 0, 0.06)
      if (rLegGroup.current) rLegGroup.current.rotation.x = THREE.MathUtils.lerp(rLegGroup.current.rotation.x, 0, 0.06)

      if (isPondering) {
        if (head.current) head.current.rotation.y = Math.sin(t * 2.3) * 0.42
        if (rArmGroup.current) rArmGroup.current.rotation.x = THREE.MathUtils.lerp(rArmGroup.current.rotation.x, -0.9, 0.05)
        root.current.rotation.y = Math.sin(t * 0.38) * 0.12
      } else {
        root.current.position.y = curPos.current.y + offsetY.current + Math.sin(t * 1.1) * 0.02
        if (head.current) head.current.rotation.y = Math.sin(t * 0.65) * 0.18
        if (lArmGroup.current) lArmGroup.current.rotation.x = THREE.MathUtils.lerp(lArmGroup.current.rotation.x, 0, 0.05)
        if (rArmGroup.current) rArmGroup.current.rotation.x = THREE.MathUtils.lerp(rArmGroup.current.rotation.x, 0, 0.05)
      }
    }
  })

  return (
    <group ref={root} position={targetPos} onClick={e => { e.stopPropagation(); onSelect(agent) }}>
      {/* Hitbox invisível — aumenta a área de clique do personagem */}
      <mesh visible={false}>
        <boxGeometry args={[1.2, 2.2, 1.2]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.46, 0.58, 24]} />
          <meshStandardMaterial color="#ec4899" emissive="#ec4899" emissiveIntensity={1.2} />
        </mesh>
      )}

      {/* Cabeça */}
      <mesh ref={head} position={[0, 1.68, 0]} castShadow>
        <sphereGeometry args={[0.26, 10, 8]} />
        <meshStandardMaterial color={skin} roughness={0.75} />
      </mesh>
      {/* Cabelo */}
      <mesh position={[0, 1.88, 0]}>
        <sphereGeometry args={[0.27, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color={hair} roughness={0.9} />
      </mesh>
      {/* Olhos */}
      {([-0.1, 0.1] as number[]).map((ex, i) => (
        <mesh key={i} position={[ex, 1.72, 0.22]}>
          <sphereGeometry args={[0.038, 6, 6]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}

      {/* Pescoço */}
      <mesh position={[0, 1.42, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.2, 7]} />
        <meshStandardMaterial color={skin} roughness={0.75} />
      </mesh>

      {/* Torso */}
      <mesh position={[0, 1.08, 0]} castShadow>
        <cylinderGeometry args={[0.21, 0.24, 0.65, 7]} />
        <meshStandardMaterial color={shirt} roughness={0.55} />
      </mesh>

      {/* Braço esquerdo — pivot no ombro */}
      <group ref={lArmGroup} position={[-0.33, 1.3, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <cylinderGeometry args={[0.088, 0.07, 0.6, 6]} />
          <meshStandardMaterial color={shirt} roughness={0.55} />
        </mesh>
      </group>

      {/* Braço direito — pivot no ombro */}
      <group ref={rArmGroup} position={[0.33, 1.3, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <cylinderGeometry args={[0.088, 0.07, 0.6, 6]} />
          <meshStandardMaterial color={shirt} roughness={0.55} />
        </mesh>
      </group>

      {/* Quadril */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.21, 0.28, 7]} />
        <meshStandardMaterial color="#2a2a4a" roughness={0.7} />
      </mesh>

      {/* Perna esquerda — pivot no quadril */}
      <group ref={lLegGroup} position={[-0.13, 0.7, 0]}>
        <mesh position={[0, -0.31, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.09, 0.62, 6]} />
          <meshStandardMaterial color="#1e1e3a" roughness={0.7} />
        </mesh>
      </group>

      {/* Perna direita — pivot no quadril */}
      <group ref={rLegGroup} position={[0.13, 0.7, 0]}>
        <mesh position={[0, -0.31, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.09, 0.62, 6]} />
          <meshStandardMaterial color="#1e1e3a" roughness={0.7} />
        </mesh>
      </group>

      {/* Pés */}
      {([-0.13, 0.13] as number[]).map((fx, i) => (
        <mesh key={i} position={[fx, 0.07, 0.07]}>
          <boxGeometry args={[0.14, 0.1, 0.26]} />
          <meshStandardMaterial color="#111" roughness={0.9} />
        </mesh>
      ))}

      {/* Orbe de status */}
      <mesh position={[0, 2.1, 0]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial color={statusC} emissive={statusC} emissiveIntensity={1.6} />
      </mesh>

      {/* Tooltip flutuante — nome, cargo, status e missão atual */}
      <Html position={[0, 2.65, 0]} center distanceFactor={14} zIndexRange={[100, 0]} prepend>
        <div style={{
          background: 'rgba(6,6,20,0.92)', color: '#fff',
          fontSize: '11px', fontWeight: 700, lineHeight: 1.4,
          padding: '5px 9px 4px', borderRadius: '7px',
          border: `1px solid ${shirt}88`, pointerEvents: 'none',
          fontFamily: 'Inter, system-ui, sans-serif',
          textShadow: '0 1px 3px #000', userSelect: 'none',
          maxWidth: '160px',
        }}>
          {/* Nome */}
          {agent.name.split(' ')[0]}
          {/* Cargo */}
          <span style={{ display: 'block', fontSize: '9px', color: shirt, fontWeight: 600, opacity: 0.85 }}>
            {agent.role.split(' ').slice(0, 3).join(' ')}
          </span>
          {/* Status */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusC, flexShrink: 0, boxShadow: `0 0 4px ${statusC}` }} />
            <span style={{ fontSize: '9px', color: statusC, fontWeight: 600 }}>{STATUS_LABEL[agent.status]}</span>
          </span>
          {/* Tarefa atual (real) */}
          {agent.currentTask && (
            <span style={{ display: 'block', fontSize: '9px', color: '#d1d5db', fontWeight: 400, marginTop: '2px', opacity: 0.9, whiteSpace: 'normal', lineHeight: 1.3 }}>
              {agent.currentTask.length > 40 ? agent.currentTask.slice(0, 40) + '…' : agent.currentTask}
            </span>
          )}
        </div>
      </Html>
    </group>
  )
}

// ============================================================
// LOTUS SIGNAGE
// ============================================================
function LotusSignage({ y }: { y: number }) {
  return (
    <group position={[0, y, BD / 2 + 0.12]}>
      <mesh><boxGeometry args={[7, 1.4, 0.06]} /><meshStandardMaterial color="#080818" metalness={0.5} /></mesh>
      <Text position={[0, 0.15, 0.04]} fontSize={0.78} color="#ec4899" anchorX="center" anchorY="middle">LOTUS</Text>
      <Text position={[0, -0.38, 0.04]} fontSize={0.24} color="#f9a8d4" anchorX="center" anchorY="middle">AI Enterprise</Text>
      <pointLight color="#ec4899" intensity={1.5} distance={8} />
    </group>
  )
}

// ============================================================
// EDIFÍCIO COMPLETO
// ============================================================
interface BuildingProps {
  viewMode: ViewMode
  activeFloor: number | null
  agents: Agent[]
  selectedAgent: Agent | null
  onSelectAgent: (a: Agent) => void
}

function Building({ viewMode, activeFloor, agents, selectedAgent, onSelectAgent }: BuildingProps) {
  const isDH = viewMode === 'dollhouse' || viewMode === 'interior'
  const glassOp = isDH ? 0.04 : 0.11

  return (
    <group>
      {/* Chão */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#0b0b1a" roughness={1} />
      </mesh>
      <gridHelper args={[80, 40, '#161628', '#161628']} position={[0, -0.11, 0]} />

      {/* Lajes */}
      {Array.from({ length: NF + 1 }, (_, i) => <FloorSlab key={i} level={i} opacity={isDH ? 0.4 : 1} />)}

      {/* Colunas estruturais */}
      {[-BW / 2 + 0.5, 0, BW / 2 - 0.5].flatMap(x =>
        [-BD / 2 + 0.5, BD / 2 - 0.5].map(z => <StructuralColumn key={`${x}${z}`} x={x} z={z} />)
      )}

      {/* Fachada de vidro */}
      <GlassPanel position={[0, NF * FH / 2, BD / 2 + 0.01]} rotation={[0, 0, 0]} w={BW} h={NF * FH} opacity={glassOp} />
      <GlassPanel position={[0, NF * FH / 2, -BD / 2 - 0.01]} rotation={[0, Math.PI, 0]} w={BW} h={NF * FH} opacity={glassOp} />
      <GlassPanel position={[-BW / 2 - 0.01, NF * FH / 2, 0]} rotation={[0, Math.PI / 2, 0]} w={BD} h={NF * FH} opacity={glassOp} />
      <GlassPanel position={[BW / 2 + 0.01, NF * FH / 2, 0]} rotation={[0, -Math.PI / 2, 0]} w={BD} h={NF * FH} opacity={glassOp} />

      {/* Faixas de andar */}
      {Array.from({ length: NF }, (_, i) => {
        const y = (i + 1) * FH - 0.08
        const c = DEPTS.find(d => d.floor === i)?.color ?? '#1e1e3a'
        return (
          <group key={i}>
            {[BD / 2, -BD / 2].map((z, j) => (
              <mesh key={j} position={[0, y, z]}><boxGeometry args={[BW, 0.07, 0.07]} /><meshStandardMaterial color="#2a3a5a" metalness={0.85} /></mesh>
            ))}
            {[-BW / 2, BW / 2].map((x, j) => (
              <mesh key={j + 2} position={[x, y, 0]}><boxGeometry args={[0.07, 0.07, BD]} /><meshStandardMaterial color="#2a3a5a" metalness={0.85} /></mesh>
            ))}
            <mesh position={[0, i * FH + 0.1, 0]}>
              <boxGeometry args={[BW - 0.5, 0.045, BD - 0.5]} />
              <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.25} />
            </mesh>
          </group>
        )
      })}

      {/* Muxarabi vertical */}
      {[-8, -4, 0, 4, 8].flatMap((x, i) =>
        [BD / 2, -BD / 2].map((z, j) => (
          <mesh key={`v${i}${j}`} position={[x, NF * FH / 2, z]}>
            <boxGeometry args={[0.06, NF * FH, 0.06]} />
            <meshStandardMaterial color="#2a3a5a" metalness={0.85} />
          </mesh>
        ))
      )}

      {/* Cobertura */}
      <mesh position={[0, NF * FH + 0.3, 0]} castShadow>
        <boxGeometry args={[BW, 0.6, BD]} />
        <meshStandardMaterial color="#17172a" metalness={0.4} />
      </mesh>
      {([[-7, -4], [0, 4.5], [7, -4], [-3, 4.5], [3, -4]] as [number, number][]).map(([rx, rz], i) => (
        <mesh key={i} position={[rx, NF * FH + 0.9, rz]} castShadow>
          <boxGeometry args={[2, 0.75, 1.4]} />
          <meshStandardMaterial color="#252535" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      <LotusSignage y={NF * FH - 1.1} />

      {/* Escadas + elevador */}
      {Array.from({ length: NF }, (_, i) => <Staircase key={i} floorLevel={i} />)}
      <ElevatorShaft />

      {/* Interiores dos andares (apenas em dollhouse/interior) */}
      {isDH && Array.from({ length: NF }, (_, i) => {
        const floorDepts = DEPTS.filter(d => d.floor === i)
        const show = activeFloor === null || activeFloor === i
        const hasTwoRooms = floorDepts.length > 1
        return (
          <group key={i}>
            {floorDepts.map(dept => (
              <group key={dept.id} visible={show}>
                <DeptRoom dept={dept} floorY={getFloorY(i)} />
              </group>
            ))}
            {/* Divisória entre departamentos do mesmo andar */}
            {hasTwoRooms && show && (
              <RoomDivider x={0} floorY={getFloorY(i)} />
            )}
          </group>
        )
      })}

      {/* Personagens */}
      {agents.map(agent => {
        const dept = DEPTS.find(d => d.id === agent.departmentId)
        const floorLevel = dept?.floor ?? 0
        const show = activeFloor === null || activeFloor === floorLevel
        if (!show) return null
        const placement = getAgentPlacement(agent, agents)
        return (
          <Character3D
            key={agent.id}
            agent={agent}
            targetPos={placement.pos}
            seated={placement.seated}
            onSelect={onSelectAgent}
            selected={selectedAgent?.id === agent.id}
          />
        )
      })}

      {/* Prédios do fundo */}
      {([
        [-42, 0, 28, 9, 48, 9], [42, 0, -18, 8, 32, 8],
        [-36, 0, -16, 6, 42, 6], [46, 0, 24, 7, 36, 7],
        [-52, 0, 8, 5, 24, 5], [50, 0, -12, 9, 22, 9],
      ] as [number, number, number, number, number, number][]).map(([bx, _by, bz, bw, bh, bdp], i) => (
        <mesh key={i} position={[bx, bh / 2, bz]}>
          <boxGeometry args={[bw, bh, bdp]} />
          <meshStandardMaterial color="#0d0d1f" metalness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

// ============================================================
// CÂMERA INTERIOR
// ============================================================
function CameraController({ viewMode, activeFloor }: { viewMode: ViewMode; activeFloor: number | null }) {
  const { camera } = useThree()
  useEffect(() => {
    if (viewMode === 'interior' && activeFloor !== null) {
      // Câmera DENTRO do andar: perto da parede frontal, olhando para a parede de fundo
      camera.position.set(0, getFloorY(activeFloor) + 2.2, 5.5)
    } else if (viewMode === 'dollhouse') {
      // Vista dollhouse frontal: câmera elevada à frente do prédio, mostra todos os andares
      camera.position.set(2, NF * FH * 0.78, 42)
    } else if (viewMode === 'exterior') {
      camera.position.set(24, 24, 24)
    }
  }, [viewMode, activeFloor, camera])
  return null
}

// ============================================================
// CENA
// ============================================================
function Scene({ viewMode, activeFloor, ...rest }: BuildingProps) {
  const targetArr: [number, number, number] = viewMode === 'interior' && activeFloor !== null
    ? [0, getFloorY(activeFloor) + 1.5, -2]   // Olhando para a parede de fundo
    : viewMode === 'dollhouse'
    ? [0, NF * FH * 0.4, 0]                    // Centro do prédio para dollhouse
    : [0, NF * FH * 0.52, 0]                   // Vista exterior — centro visual do prédio (y≈14.7, preenche canvas verticalmente)

  return (
    <>
      {/* Luz ambiente mais forte para realçar interiores */}
      <ambientLight intensity={1.1} />
      <directionalLight position={[22, 42, 14]} intensity={1.4} castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={120}
        shadow-camera-left={-30} shadow-camera-right={30}
        shadow-camera-top={45} shadow-camera-bottom={-10}
      />
      <directionalLight position={[-16, 18, -12]} intensity={0.7} color="#6688cc" />
      {/* Luz fill de baixo para iluminar os andares internamente */}
      <directionalLight position={[0, 2, 20]} intensity={0.8} color="#ffffff" />
      <directionalLight position={[0, 2, -20]} intensity={0.6} color="#ffffff" />
      <pointLight position={[0, NF * FH + 1, BD / 2 + 3]} color="#ec4899" intensity={3.5} distance={28} />
      <color attach="background" args={['#060614']} />
      <fog attach="fog" args={['#060614', 50, 120]} />
      {/* Ground plane — preenche a área visível ao redor do prédio */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#060614" roughness={1} metalness={0} />
      </mesh>
      <CameraController viewMode={viewMode} activeFloor={activeFloor} />
      <Building viewMode={viewMode} activeFloor={activeFloor} {...rest} />
      <OrbitControls
        enablePan enableZoom enableRotate
        minDistance={viewMode === 'interior' ? 0.5 : 9}
        maxDistance={viewMode === 'interior' ? 18 : 90}
        maxPolarAngle={viewMode === 'interior' ? Math.PI * 0.92 : Math.PI / 2.05}
        target={targetArr}
        dampingFactor={0.08}
        enableDamping
      />
    </>
  )
}

// ============================================================
// UI — PAINEL DO AGENTE
// ============================================================
function AgentPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const dept = DEPTS.find(d => d.id === agent.departmentId)
  const c = dept?.color ?? '#6b7280'
  return (
    <motion.div
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="absolute right-4 top-14 bottom-4 w-80 z-30 pointer-events-auto"
    >
      <div className="h-full rounded-xl border border-white/10 bg-black/80 backdrop-blur-xl overflow-y-auto flex flex-col">
        <div className="p-4 rounded-t-xl" style={{ background: `${c}20` }}>
          <div className="flex items-start justify-between">
            <div className="w-14 h-14 rounded-full border-2 flex items-center justify-center text-xl font-bold"
              style={{ background: `${c}30`, borderColor: c }}>
              {agent.name.charAt(0)}
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X size={18} /></button>
          </div>
          <div className="mt-2.5">
            <h3 className="text-white font-bold text-base">{agent.name}</h3>
            <p className="text-white/55 text-xs mt-0.5">{agent.role}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: `${c}30`, color: c }}>
              {dept?.icon} {dept?.name}
            </span>
          </div>
        </div>

        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[agent.status], boxShadow: `0 0 6px ${STATUS_COLOR[agent.status]}` }} />
            <span className="text-sm font-medium text-white">{STATUS_LABEL[agent.status]}</span>
          </div>
          {agent.currentTask && (
            <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-white/5">
              <p className="text-xs text-white/35 mb-1">{agent.status === 'working' ? 'Tarefa em execução' : 'Próxima tarefa'}</p>
              <p className="text-xs text-white/75">{agent.currentTask}</p>
            </div>
          )}
          {agent.currentMission && (
            <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-white/5">
              <p className="text-xs text-white/35 mb-1">Missão</p>
              <p className="text-xs text-white/75">{agent.currentMission}</p>
            </div>
          )}
          {!agent.currentTask && agent.status === 'idle' && (
            <p className="mt-2 text-xs text-white/35">Sem tarefa atribuída no momento.</p>
          )}
        </div>

        <div className="p-4 border-b border-white/5 grid grid-cols-2 gap-2.5">
          {[{ label: 'Concluídas', val: agent.tasksCompleted }, { label: 'Pendentes', val: agent.tasksPending }].map(s => (
            <div key={s.label} className="p-2.5 rounded-lg bg-white/5 text-center">
              <p className="text-xl font-bold text-white">{s.val}</p>
              <p className="text-xs text-white/35 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="p-4 flex-1">
          <p className="text-xs font-semibold text-white/35 uppercase tracking-wider mb-2.5">Atividade recente</p>
          <div className="space-y-2">
            {agent.lastActivity.length === 0 && (
              <p className="text-xs text-white/30">Sem atividade registrada</p>
            )}
            {agent.lastActivity.map((a, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="w-1.5 h-1.5 rounded-full bg-white/20 mt-1.5 shrink-0" />
                <p className="text-xs text-white/55">{a}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 pt-0">
          <Link href="/ceo" className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: c }}>
            <MessageCircle size={15} />
            Falar com {agent.name.split(' ')[0]}
          </Link>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================
// UI — SELETOR DE ANDAR
// ============================================================
function FloorSelector({ active, onChange }: { active: number | null; onChange: (n: number | null) => void }) {
  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 pointer-events-auto">
      <button onClick={() => onChange(null)}
        className={cn('w-11 h-9 rounded-lg text-[11px] font-bold transition-all border',
          active === null ? 'bg-pink-500 border-pink-400 text-white' : 'bg-black/55 border-white/10 text-white/45 hover:text-white')}>
        ALL
      </button>
      {Array.from({ length: NF }, (_, i) => NF - 1 - i).map(lvl => {
        const c = DEPTS.find(d => d.floor === lvl)?.color ?? '#6b7280'
        const isAct = active === lvl
        return (
          <button key={lvl} onClick={() => onChange(isAct ? null : lvl)} title={FLOOR_NAMES[lvl]}
            className={cn('w-11 h-9 rounded-lg text-[11px] font-bold transition-all border', !isAct && 'bg-black/55 border-white/10 text-white/45 hover:text-white')}
            style={isAct ? { background: `${c}cc`, borderColor: c, color: '#fff', boxShadow: `0 0 14px ${c}55` } : {}}>
            {lvl}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================
// UI — TOGGLE DE MODO DE CÂMERA
// ============================================================
function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5 bg-black/65 backdrop-blur-sm border border-white/10 rounded-xl p-1.5 pointer-events-auto">
      {([
        { v: 'exterior' as ViewMode, icon: Building2, label: 'Exterior' },
        { v: 'dollhouse' as ViewMode, icon: Layers, label: 'Corte Interior' },
        { v: 'interior' as ViewMode, icon: Eye, label: 'Dentro' },
      ] as const).map(({ v, icon: Icon, label }) => (
        <button key={v} onClick={() => onChange(v)}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            mode === v ? 'bg-pink-500 text-white shadow-lg' : 'text-white/50 hover:text-white')}>
          <Icon size={15} />{label}
        </button>
      ))}
    </div>
  )
}

// ============================================================
// UI — BARRA SUPERIOR
// ============================================================
function TopBar({ agents, connection }: { agents: Agent[]; connection: Connection }) {
  const counts = {
    working: agents.filter(a => a.status === 'working').length,
    waiting: agents.filter(a => a.status === 'waiting_approval').length,
    thinking: agents.filter(a => a.status === 'thinking').length,
    idle: agents.filter(a => a.status === 'idle').length,
  }
  const conn = {
    live: { dot: 'bg-green-400', label: 'Live' },
    connecting: { dot: 'bg-amber-400 animate-pulse', label: 'Conectando…' },
    offline: { dot: 'bg-red-500', label: 'Sem conexão' },
  }[connection]
  return (
    <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-black/70 backdrop-blur-sm border-b border-white/5 pointer-events-auto">
      <div className="flex items-center gap-3">
        <div className="text-pink-400 font-bold text-sm flex items-center gap-1.5">
          <Building2 size={16} /> LOTUS HQ
        </div>
        <ChevronRight size={12} className="text-white/20" />
        <span className="text-xs text-white/35">Virtual Office 3D</span>
      </div>
      <div className="flex items-center gap-4">
        {[
          ['Trabalhando', counts.working, '#22c55e'],
          ['Aguardando aprovação', counts.waiting, '#f59e0b'],
          ['Na fila', counts.thinking, '#3b82f6'],
          ['Livre', counts.idle, '#6b7280'],
        ].map(([lbl, cnt, col]) => (
          <div key={lbl as string} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: col as string }} />
            <span className="text-xs text-white/45">{cnt as number} {lbl as string}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <div className={cn('w-2 h-2 rounded-full', conn.dot)} />
          <span className={cn('text-xs', connection === 'offline' ? 'text-red-400' : 'text-white/35')}>{conn.label}</span>
        </div>
      </div>
    </div>
  )
}

function ControlsHint() {
  return (
    <div className="absolute bottom-16 right-4 z-10 text-right space-y-0.5 pointer-events-none">
      <p className="text-xs text-white/22">🖱 Arraste → girar câmera</p>
      <p className="text-xs text-white/22">⚙ Scroll → zoom</p>
      <p className="text-xs text-white/22">👆 Clique → selecionar agente</p>
    </div>
  )
}

// ============================================================
// ACTIVITY FEED + AGENCY EVALUATION
// ============================================================


const MISSING_ROLES = [
  { role: 'PR & Relações Públicas', icon: '📣' },
  { role: 'Influencer Marketing', icon: '🌟' },
  { role: 'Editor de Vídeo', icon: '🎬' },
  { role: 'Motion Designer', icon: '🎨' },
  { role: 'Social Media Manager', icon: '📱' },
  { role: 'Especialista em SEO', icon: '🔍' },
  { role: 'Email Marketing', icon: '📧' },
  { role: 'UX/UI Designer', icon: '🖌' },
  { role: 'Especialista em CRO', icon: '📊' },
  { role: 'Customer Success', icon: '🤝' },
  { role: 'WhatsApp / CRM', icon: '💬' },
]

function formatFeedTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function ActivityFeed({ events, onClose }: { events: FeedItem[]; onClose: () => void }) {
  return (
    <motion.div
      initial={{ x: -300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -300, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute left-16 top-14 w-64 z-30 pointer-events-auto"
      style={{ bottom: '3.5rem' }}
    >
      <div className="h-full rounded-xl border border-white/10 bg-black/85 backdrop-blur-xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">Atividade real</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/80 transition-colors"><X size={13} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {events.length === 0 && (
            <p className="text-[11px] text-white/30 text-center py-6 px-2">Nenhuma atividade registrada ainda.</p>
          )}
          <AnimatePresence initial={false}>
            {events.map(ev => {
              const color = getDeptColor(ev.departmentId)
              return (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, x: -12, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  transition={{ duration: 0.2 }}
                  className="flex gap-2 p-2 rounded-lg bg-white/4 border border-white/5"
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                    style={{ background: `${color}25`, color }}
                  >
                    {ev.agentName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-semibold text-white/75 truncate">{ev.agentName.split(' ')[0]}</span>
                      <span className="text-[9px] text-white/22 flex-shrink-0">{formatFeedTime(ev.time)}</span>
                    </div>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-snug line-clamp-2">{ev.action}</p>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

function AgencyEvalPanel({ agents, onClose }: { agents: Agent[]; onClose: () => void }) {
  const hired = agents.filter(a => a.status !== 'offline')
  const coverage = hired.length === 0 ? 0 : Math.round((hired.length / (hired.length + MISSING_ROLES.length)) * 100)
  return (
    <motion.div
      initial={{ y: 32, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 32, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute left-16 right-4 bottom-16 z-30 pointer-events-auto"
    >
      <div className="rounded-xl border border-white/10 bg-black/90 backdrop-blur-xl overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Avaliação da Agência</h3>
            <p className="text-xs text-white/35 mt-0.5">{coverage}% de cobertura para uma agência completa</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-28 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-pink-500 rounded-full" style={{ width: `${coverage}%` }} />
              </div>
              <span className="text-sm font-bold text-pink-400">{coverage}%</span>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white/80 p-1"><X size={16} /></button>
          </div>
        </div>
        <div className="p-4 max-h-64 overflow-y-auto">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-2">
                ✅ Contratado — {hired.length} agentes
              </p>
              <div className="space-y-1">
                {hired.map(a => (
                  <div key={a.id} className="flex items-center gap-1.5 py-0.5 border-b border-white/4 last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: getDeptColor(a.departmentId) }} />
                    <span className="text-[11px] text-white/55 truncate">{a.role}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-2">
                🔜 Próxima contratação — {MISSING_ROLES.length} vagas
              </p>
              <div className="space-y-1">
                {MISSING_ROLES.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 py-0.5 border-b border-white/4 last:border-0">
                    <span className="text-sm flex-shrink-0">{r.icon}</span>
                    <span className="text-[11px] text-amber-300/50">{r.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================
// EXPORT PRINCIPAL
// ============================================================
export function LotusHQ3D() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('exterior')
  const [activeFloor, setActiveFloor] = useState<number | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [showFeed, setShowFeed] = useState(false)
  const [showEval, setShowEval] = useState(false)
  const [feedEvents, setFeedEvents] = useState<FeedItem[]>([])
  const snapshotRef = useRef('')

  // Estado REAL: agentes e atividade vêm do banco via /api/hq/agents (poll a cada 5s).
  // Nenhum dado é simulado — se a API falhar, o HQ mostra "Sem conexão".
  useEffect(() => {
    let cancelled = false

    const pollAgents = async () => {
      try {
        const res = await fetch('/api/hq/agents', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as {
          agents?: Array<Omit<Agent, 'status'> & { status: string }>
          feed?: FeedItem[]
        }
        if (cancelled) return
        if (!Array.isArray(data.agents)) throw new Error('Resposta inválida')

        const live: Agent[] = data.agents.map(a => ({
          id: a.id,
          name: a.name,
          role: a.role,
          departmentId: a.departmentId,
          status: VALID_STATUSES.includes(a.status as AgentStatus) ? (a.status as AgentStatus) : 'idle',
          currentTask: a.currentTask ?? null,
          currentMission: a.currentMission ?? null,
          tasksCompleted: a.tasksCompleted ?? 0,
          tasksPending: a.tasksPending ?? 0,
          lastActivity: Array.isArray(a.lastActivity) ? a.lastActivity : [],
        }))
        const feed = Array.isArray(data.feed) ? data.feed : []

        // Só atualiza o estado (e re-renderiza a cena) quando algo mudou de fato
        const snapshot = JSON.stringify([live, feed])
        if (snapshot !== snapshotRef.current) {
          snapshotRef.current = snapshot
          setAgents(live)
          setFeedEvents(feed)
        }
        setConnection('live')
      } catch {
        if (!cancelled) setConnection('offline')
      }
    }

    pollAgents()
    const timer = setInterval(pollAgents, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const selected = useMemo(
    () => agents.find(a => a.id === selectedId) ?? null,
    [agents, selectedId]
  )

  const handleSelect = useCallback((a: Agent) => {
    setSelectedId(p => p === a.id ? null : a.id)
  }, [])

  // Ao entrar no modo interior sem andar selecionado, auto-seleciona andar 0
  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    if (mode === 'interior' && activeFloor === null) {
      setActiveFloor(0)
    }
  }, [activeFloor])

  return (
    <div className="absolute inset-0 bg-[#060614]">
      <TopBar agents={agents} connection={connection} />
      <Canvas
        shadows
        dpr={[1, 1.5]}
        performance={{ min: 0.5 }}
        camera={{ position: [24, 24, 24], fov: 45, near: 0.1, far: 500 }}
        style={{ position: 'absolute', inset: 0 }}
        onPointerMissed={() => setSelectedId(null)}
      >
        <Suspense fallback={null}>
          <Scene
            viewMode={viewMode}
            activeFloor={activeFloor}
            agents={agents}
            selectedAgent={selected}
            onSelectAgent={handleSelect}
          />
        </Suspense>
      </Canvas>
      {/* Gradient to blend dark ground plane into background */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28%', background: 'linear-gradient(to bottom, transparent, #060614 85%)', pointerEvents: 'none', zIndex: 1 }} />
      <div className="absolute inset-0 pointer-events-none">
        <FloorSelector active={activeFloor} onChange={setActiveFloor} />
        <ViewToggle mode={viewMode} onChange={handleViewChange} />
        <ControlsHint />

        {connection === 'offline' && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-medium">
            Sem conexão com o banco — {agents.length > 0 ? 'exibindo o último estado real recebido' : 'nenhum agente carregado'}
          </div>
        )}
        {connection === 'live' && agents.length === 0 && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-black/70 border border-white/10 text-white/60 text-xs">
            Nenhum agente cadastrado no banco.
          </div>
        )}

        {/* Feed + Eval toggle buttons */}
        <div className="absolute bottom-4 left-16 flex gap-2 pointer-events-auto z-20">
          <button
            onClick={() => setShowFeed(p => !p)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              showFeed
                ? 'bg-green-500/20 border-green-500/40 text-green-400'
                : 'bg-black/55 border-white/10 text-white/45 hover:text-white hover:border-white/20'
            )}
          >
            <Activity size={12} /> Feed
          </button>
          <button
            onClick={() => setShowEval(p => !p)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              showEval
                ? 'bg-pink-500/20 border-pink-500/40 text-pink-400'
                : 'bg-black/55 border-white/10 text-white/45 hover:text-white hover:border-white/20'
            )}
          >
            <BarChart2 size={12} /> Avaliação
          </button>
        </div>

        <AnimatePresence>
          {showFeed && <ActivityFeed events={feedEvents} onClose={() => setShowFeed(false)} />}
          {showEval && <AgencyEvalPanel agents={agents} onClose={() => setShowEval(false)} />}
          {selected && <AgentPanel agent={selected} onClose={() => setSelectedId(null)} />}
        </AnimatePresence>
      </div>
    </div>
  )
}
