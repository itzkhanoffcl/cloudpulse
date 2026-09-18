import { useCallback, useEffect, useState } from "react"

const REFRESH_INTERVAL = 30000

function formatValue(value, decimals = 2) {
  if (value === null || value === undefined) return "--"
  return Number(value).toFixed(decimals)
}

function MetricBar({ value }) {
  const safeValue = Math.min(Math.max(Number(value) || 0, 0), 100)

  return (
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-cyan-400 transition-all duration-700"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  )
}

function StatusDot({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-400">
      <span className="h-2 w-2 rounded-full bg-emerald-400" />
      {children}
    </span>
  )
}

function MetricCard({ icon, label, value, subtitle, progress }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/10">
      <div className="flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-xl">
          {icon}
        </div>

        {progress !== undefined && (
          <span className="text-xs font-medium text-slate-500">
            LIVE
          </span>
        )}
      </div>

      <p className="mt-6 text-sm text-slate-400">{label}</p>

      <div className="mt-2 text-3xl font-bold text-white">
        {value}
      </div>

      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>

      {progress !== undefined && <MetricBar value={progress} />}
    </div>
  )
}

function App() {
  const [ec2, setEc2] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [memory, setMemory] = useState(null)
  const [disk, setDisk] = useState(null)
  const [network, setNetwork] = useState(null)
  const [health, setHealth] = useState(null)
  const [cost, setCost] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadDashboard = useCallback(async () => {
    try {
      setError("")

      const results = await Promise.allSettled([
        fetch("/api/ec2").then((res) => {
          if (!res.ok) throw new Error("EC2 API failed")
          return res.json()
        }),

        fetch("/api/metrics").then((res) => {
          if (!res.ok) throw new Error("CPU API failed")
          return res.json()
        }),

        fetch("/api/memory").then((res) => {
          if (!res.ok) throw new Error("Memory API failed")
          return res.json()
        }),

        fetch("/api/disk").then((res) => {
          if (!res.ok) throw new Error("Disk API failed")
          return res.json()
        }),

        fetch("/api/network").then((res) => {
          if (!res.ok) throw new Error("Network API failed")
          return res.json()
        }),

        fetch("/api/system-health").then((res) => {
          if (!res.ok) throw new Error("Health API failed")
          return res.json()
        }),

        fetch("/api/cost").then((res) => {
          if (!res.ok) throw new Error("Cost API failed")
          return res.json()
        }),
      ])

      const [
        ec2Result,
        cpuResult,
        memoryResult,
        diskResult,
        networkResult,
        healthResult,
        costResult,
      ] = results

      if (ec2Result.status === "fulfilled") {
        setEc2(ec2Result.value)
      }

      if (cpuResult.status === "fulfilled") {
        setMetrics(cpuResult.value)
      }

      if (memoryResult.status === "fulfilled") {
        setMemory(memoryResult.value)
      }

      if (diskResult.status === "fulfilled") {
        setDisk(diskResult.value)
      }

      if (networkResult.status === "fulfilled") {
        setNetwork(networkResult.value)
      }

      if (healthResult.status === "fulfilled") {
        setHealth(healthResult.value)
      }

      if (costResult.status === "fulfilled") {
        setCost(costResult.value)
      }

      const successful = results.filter(
        (result) => result.status === "fulfilled"
      ).length

      if (successful === 0) {
        throw new Error("CloudPulse API is unavailable")
      }

      setLastUpdated(new Date())
    } catch (err) {
      console.error(err)
      setError(err.message || "Unable to load dashboard")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()

    const interval = setInterval(
      loadDashboard,
      REFRESH_INTERVAL
    )

    return () => clearInterval(interval)
  }, [loadDashboard])

  const cpuValue = Number(metrics?.value || 0)
  const memoryValue = Number(memory?.value || 0)
  const diskValue = Number(disk?.value || 0)

  const networkIn = Number(
    network?.network_in?.value || 0
  )

  const networkOut = Number(
    network?.network_out?.value || 0
  )

  const isRunning = ec2?.state === "running"
  const apiOnline = !error
  const cloudWatchConnected =
    metrics !== null || memory !== null || disk !== null

  return (
    <div className="min-h-screen bg-[#020617] text-white">

      {/* HEADER */}
      <header className="border-b border-slate-800/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">

          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-2xl shadow-lg">
              ☁️
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                CloudPulse
              </h1>

              <p className="text-sm text-slate-500">
                AWS Infrastructure Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-xs text-slate-500">
                Last updated
              </p>

              <p className="text-sm text-slate-300">
                {lastUpdated
                  ? lastUpdated.toLocaleTimeString()
                  : "--"}
              </p>
            </div>

            <StatusDot>
              {isRunning ? "System Active" : "System Offline"}
            </StatusDot>
          </div>

        </div>
      </header>

      {/* MAIN */}
      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">

        {/* HERO */}
        <section className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">

          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-cyan-400">
              Cloud Infrastructure
            </p>

            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Infrastructure Overview
            </h2>

            <p className="mt-3 text-lg text-slate-400">
              Real-time visibility into your AWS environment.
            </p>
          </div>

          <button
            onClick={loadDashboard}
            className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 font-semibold text-slate-200 transition hover:border-cyan-500/50 hover:bg-slate-800"
          >
            ↻ Refresh Data
          </button>

        </section>

        {/* ERROR */}
        {error && (
          <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-300">
            Some monitoring services are temporarily unavailable:
            {" "}
            {error}
          </div>
        )}

        {/* TOP STATUS CARDS */}
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

          <MetricCard
            icon="🖥️"
            label="Instance Status"
            value={
              loading
                ? "Loading..."
                : ec2?.state
                  ? ec2.state.charAt(0).toUpperCase() +
                    ec2.state.slice(1)
                  : "--"
            }
            subtitle={ec2?.instance_id || "EC2 Instance"}
          />

          <MetricCard
            icon="📊"
            label="CPU Utilization"
            value={`${formatValue(cpuValue)}%`}
            subtitle="CloudWatch CPUUtilization"
            progress={cpuValue}
          />

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/10">
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-xl">
                ⚡
              </div>

              <span className="text-xs text-slate-500">
                FastAPI
              </span>
            </div>

            <p className="mt-6 text-sm text-slate-400">
              API Status
            </p>

            <div className="mt-2 text-3xl font-bold text-emerald-400">
              {apiOnline ? "Online" : "Offline"}
            </div>

            <p className="mt-2 text-sm text-slate-500">
              Backend connectivity
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/10">
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-xl">
                ☁️
              </div>

              <span className="text-xs text-slate-500">
                AWS
              </span>
            </div>

            <p className="mt-6 text-sm text-slate-400">
              Region
            </p>

            <div className="mt-2 text-3xl font-bold text-white">
              {ec2?.availability_zone || "--"}
            </div>

            <p className="mt-2 text-sm text-slate-500">
              Amazon Web Services
            </p>
          </div>

        </section>

        {/* RESOURCE MONITORING */}
        <section className="mt-8">

          <div className="mb-5">
            <h3 className="text-2xl font-bold">
              Resource Monitoring
            </h3>

            <p className="mt-1 text-slate-500">
              Live infrastructure resource utilization
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

            <MetricCard
              icon="⚙️"
              label="CPU"
              value={`${formatValue(cpuValue)}%`}
              subtitle="EC2 CPU utilization"
              progress={cpuValue}
            />

            <MetricCard
              icon="🧠"
              label="Memory"
              value={
                memory
                  ? `${formatValue(memoryValue)}%`
                  : "--"
              }
              subtitle={
                memory
                  ? "CWAgent memory usage"
                  : "Waiting for CloudWatch data"
              }
              progress={memory ? memoryValue : undefined}
            />

            <MetricCard
              icon="💾"
              label="Disk"
              value={
                disk
                  ? `${formatValue(diskValue)}%`
                  : "--"
              }
              subtitle={
                disk
                  ? "Root filesystem usage"
                  : "Waiting for CloudWatch data"
              }
              progress={disk ? diskValue : undefined}
            />

            <MetricCard
              icon="🌐"
              label="Network"
              value={`${formatValue(networkIn + networkOut, 0)}`}
              subtitle="Network traffic bytes / period"
            />

          </div>

        </section>

        {/* LIVE MONITORING */}
        <section className="mt-8 grid gap-6 lg:grid-cols-[1.7fr_1fr]">

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-7 shadow-xl shadow-black/10">

            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-bold">
                  Live CPU Monitoring
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  CloudWatch CPUUtilization
                </p>
              </div>

              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-400">
                ● LIVE
              </span>
            </div>

            <div className="mt-12">
              <div className="text-6xl font-bold tracking-tight">
                {formatValue(cpuValue)}%
              </div>

              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Current CPU utilization
                </p>

                <p className="text-sm text-slate-500">
                  Refresh: 30 sec
                </p>
              </div>

              <MetricBar value={cpuValue} />

              <div className="mt-3 flex justify-between text-xs text-slate-600">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

          </div>

          {/* SYSTEM HEALTH */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-7 shadow-xl shadow-black/10">

            <h3 className="text-2xl font-bold">
              System Health
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Current infrastructure state
            </p>

            <div className="mt-7 space-y-4">

              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10">
                    🖥️
                  </div>

                  <div>
                    <p className="font-semibold">
                      EC2 Instance
                    </p>

                    <p className="text-sm text-slate-500">
                      Compute
                    </p>
                  </div>
                </div>

                <span className="font-semibold text-emerald-400">
                  {ec2?.state || "unknown"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10">
                    ⚡
                  </div>

                  <div>
                    <p className="font-semibold">
                      FastAPI
                    </p>

                    <p className="text-sm text-slate-500">
                      Backend
                    </p>
                  </div>
                </div>

                <span className="font-semibold text-emerald-400">
                  {apiOnline ? "Online" : "Offline"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10">
                    📈
                  </div>

                  <div>
                    <p className="font-semibold">
                      CloudWatch
                    </p>

                    <p className="text-sm text-slate-500">
                      Monitoring
                    </p>
                  </div>
                </div>

                <span className="font-semibold text-emerald-400">
                  {cloudWatchConnected
                    ? "Connected"
                    : "Waiting"}
                </span>
              </div>

            </div>
          </div>

        </section>

        {/* MEMORY + DISK DETAILS */}
        <section className="mt-8 grid gap-6 lg:grid-cols-2">

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-7">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">
                  Memory Usage
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  CloudWatch Agent
                </p>
              </div>

              <span className="text-3xl font-bold text-cyan-400">
                {memory
                  ? `${formatValue(memoryValue)}%`
                  : "--"}
              </span>
            </div>

            <MetricBar value={memoryValue} />

            <div className="mt-4 flex justify-between text-xs text-slate-600">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-7">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">
                  Disk Usage
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Root filesystem /
                </p>
              </div>

              <span className="text-3xl font-bold text-cyan-400">
                {disk
                  ? `${formatValue(diskValue)}%`
                  : "--"}
              </span>
            </div>

            <MetricBar value={diskValue} />

            <div className="mt-4 flex justify-between text-xs text-slate-600">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

        </section>

        {/* INFRASTRUCTURE DETAILS */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-7">

          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-2xl font-bold">
                Infrastructure Details
              </h3>

              <p className="mt-1 text-slate-500">
                Live information from AWS EC2
              </p>
            </div>

            <StatusDot>
              AWS Connected
            </StatusDot>
          </div>

          <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-600">
                Instance Type
              </p>

              <p className="mt-5 text-xl font-bold">
                {ec2?.instance_type || "--"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-600">
                Public IP
              </p>

              <p className="mt-5 break-all text-xl font-bold">
                {ec2?.public_ip || "--"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-600">
                Private IP
              </p>

              <p className="mt-5 break-all text-xl font-bold">
                {ec2?.private_ip || "--"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-600">
                Availability Zone
              </p>

              <p className="mt-5 text-xl font-bold">
                {ec2?.availability_zone || "--"}
              </p>
            </div>

          </div>
        </section>

        {/* LOWER DETAILS */}
        <section className="mt-5 grid gap-5 md:grid-cols-3">

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-xs uppercase tracking-wider text-slate-600">
              Instance ID
            </p>

            <p className="mt-4 break-all font-mono text-sm text-cyan-400">
              {ec2?.instance_id || "--"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-xs uppercase tracking-wider text-slate-600">
              Launch Time
            </p>

            <p className="mt-4 text-sm text-slate-300">
              {ec2?.launch_time
                ? new Date(
                    ec2.launch_time
                  ).toLocaleString()
                : "--"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-xs uppercase tracking-wider text-slate-600">
              Monitoring Status
            </p>

            <p className="mt-4 font-semibold text-emerald-400">
              ● Active
            </p>
          </div>

        </section>

        {/* COST */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-7">

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">
                AWS Cost Visibility
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Cost Explorer — recent 30-day period
              </p>
            </div>

            <span className="text-3xl">
              💰
            </span>
          </div>

          <div className="mt-6">
            {cost ? (
              <div className="text-4xl font-bold text-white">
                {cost.currency}{" "}
                {formatValue(cost.amount)}
              </div>
            ) : (
              <div className="text-2xl font-bold text-slate-500">
                Cost data unavailable
              </div>
            )}
          </div>

        </section>

      </main>

      {/* FOOTER */}
      <footer className="mt-16 border-t border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between lg:px-8">

          <span>
            CloudPulse • AWS Cloud Monitoring Platform
          </span>

          <span>
            FastAPI • Boto3 • CloudWatch • Terraform
          </span>

        </div>
      </footer>

    </div>
  )
}

export default App