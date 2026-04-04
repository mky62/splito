import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getBillData,
  getBillStatus,
  getSelections,
  getSplitResults,
  joinBill,
  submitSelection,
} from '../lib/api'
import type {
  BillData,
  Selection,
  SplitResponse,
  UserSplit,
} from '../types/api'

function getStorageKey(billId: string, suffix: string) {
  return `bill_${billId}_${suffix}`
}

function safeStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures.
  }
}

function getCurrencySymbol(currency: string) {
  const normalized = currency.trim().toUpperCase()

  if (normalized === 'INR' || normalized === '₹') return '₹'
  if (normalized === 'USD' || normalized === '$') return '$'
  if (normalized === 'EUR' || normalized === '€') return '€'
  if (!normalized) return '₹'

  return normalized
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function SharedBillPage() {
  const { billId = '' } = useParams()
  const [billData, setBillData] = useState<BillData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joinName, setJoinName] = useState(() =>
    safeStorageGet(getStorageKey(billId, 'userName')) ?? '',
  )
  const [userId, setUserId] = useState(() =>
    safeStorageGet(getStorageKey(billId, 'userId')) ?? '',
  )
  const [userName, setUserName] = useState(() =>
    safeStorageGet(getStorageKey(billId, 'userName')) ?? '',
  )
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [participants, setParticipants] = useState<Selection[]>([])
  const [joining, setJoining] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [view, setView] = useState<'join' | 'select' | 'waiting' | 'results'>('join')
  const [status, setStatus] = useState({ allSubmitted: false, expectedUsers: 0, numSubmitted: 0 })
  const [splitResults, setSplitResults] = useState<SplitResponse | null>(null)
  const [whatsAppOpen, setWhatsAppOpen] = useState(false)
  const [payerName, setPayerName] = useState('')
  const pollIntervalRef = useRef<number | null>(null)

  const currencySymbol = useMemo(
    () => getCurrencySymbol(billData?.currency ?? ''),
    [billData?.currency],
  )

  const itemSelectionTotal = useMemo(() => {
    if (!billData) return 0

    return Array.from(selectedItems).reduce(
      (sum, index) => sum + (billData.items[index]?.price ?? 0),
      0,
    )
  }, [billData, selectedItems])

  const myResult = useMemo<UserSplit | null>(() => {
    if (!splitResults || !userId) return null
    return splitResults.users?.[userId] ?? null
  }, [splitResults, userId])

  const myResultTotal = myResult?.total ?? 0

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!billId) {
      setError('Invalid bill link.')
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')

      try {
        const data = await getBillData(billId)

        if (cancelled) return

        setBillData(data)
        setStatus({
          allSubmitted: false,
          expectedUsers: data.expectedUsers ?? 0,
          numSubmitted: 0,
        })
        setLoading(false)

        await loadParticipants()

        if (userId) {
          setView('select')
          void restoreExistingUserState()
        } else {
          setView('join')
        }
      } catch (err) {
        if (cancelled) return

        setError(getErrorMessage(err, 'Failed to load bill.'))
        setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [billId, userId])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      } else if (!document.hidden && view === 'waiting') {
        startWaitingPoll()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [view])

  async function loadParticipants() {
    if (!billId) return

    try {
      const data = await getSelections(billId)
      setParticipants(data.selections ?? [])
    } catch (err) {
      console.error('Failed to load participants:', err)
    }
  }

  async function restoreExistingUserState() {
    if (!billId || !userId) return

    try {
      const statusData = await getBillStatus(billId)

      setStatus(statusData)

      if (statusData.allSubmitted) {
        await showResults()
        return
      }

      const selectionData = await getSelections(billId)
      setParticipants(selectionData.selections ?? [])

      const existingSelection = selectionData.selections?.find(
        (selection) => selection.userId === userId,
      )

      if (existingSelection?.items?.length) {
        setView('waiting')
        startWaitingPoll()
        return
      }

      setView('select')
    } catch (err) {
      console.error('Failed to restore bill state:', err)
      setView('select')
    }
  }

  function startWaitingPoll() {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current)
    }

    const poll = async () => {
      if (!billId) return

      try {
        const statusData = await getBillStatus(billId)
        setStatus(statusData)
        await loadParticipants()

        if (statusData.allSubmitted) {
          if (pollIntervalRef.current) {
            window.clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }

          await showResults()
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }

    void poll()
    pollIntervalRef.current = window.setInterval(() => {
      void poll()
    }, 2000)
  }

  async function showResults() {
    if (!billId) return

    const split = await getSplitResults(billId)
    setSplitResults(split)
    setStatus({
      allSubmitted: split.allSubmitted,
      expectedUsers: split.expectedUsers ?? billData?.expectedUsers ?? 0,
      numSubmitted: split.numSubmitted ?? 0,
    })
    setView('results')
  }

  async function handleJoinBill() {
    const trimmedName = joinName.trim()
    if (!trimmedName || !billId || !billData) {
      setError('Enter your name to join the bill.')
      return
    }

    setJoining(true)
    setError('')

    try {
      const response = await joinBill(billId, {
        totalPeople: billData.expectedUsers || 1,
        userName: trimmedName,
      })

      setUserId(response.userId)
      setUserName(response.userName)
      safeStorageSet(getStorageKey(billId, 'userId'), response.userId)
      safeStorageSet(getStorageKey(billId, 'userName'), response.userName)
      setView('select')
      await loadParticipants()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to join bill.'))
    } finally {
      setJoining(false)
    }
  }

  function toggleItem(index: number) {
    if (!billData) return

    const item = billData.items[index]
    if (!item || item.type === 'tax') {
      return
    }

    setSelectedItems((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function handleSubmitSelection() {
    if (!billId || !userId || !userName || selectedItems.size === 0) {
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await submitSelection(billId, {
        items: Array.from(selectedItems),
        userId,
        userName,
      })

      setView('waiting')
      startWaitingPoll()
      await loadParticipants()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to submit selection.'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleWhatsAppSend() {
    const name = payerName.trim()
    if (!name) {
      setError('Enter a payer name before sending the WhatsApp request.')
      return
    }

    const message = `Hey ${name}! You owe ${currencySymbol}${myResultTotal.toFixed(2)} for the bill split. Please pay up!`
    const encodedMessage = encodeURIComponent(message)
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank', 'noopener,noreferrer')
    setWhatsAppOpen(false)
    setPayerName('')
  }

  const participantCountLabel =
    participants.length > 0
      ? `${participants.length} participant${participants.length !== 1 ? 's' : ''} joined`
      : 'Be the first to join!'

  const waitingProgress =
    status.expectedUsers > 0
      ? Math.min(100, (status.numSubmitted / status.expectedUsers) * 100)
      : 0

  if (loading) {
    return (
      <main className="guest-page guest-loading-screen">
        <div className="guest-loading-logo">
          <span>🧾</span>
        </div>
        <div className="guest-loading-text">Loading bill...</div>
        <div className="guest-loading-subtext">Please wait a moment</div>
      </main>
    )
  }

  if (error && !billData) {
    return (
      <main className="guest-page">
        <div className="guest-error-card">
          <div className="guest-error-icon">!</div>
          <div>{error}</div>
        </div>
      </main>
    )
  }

  if (!billData) {
    return null
  }

  return (
    <main className="guest-page">
      {error ? (
        <div className="guest-inline-error">
          <span>!</span>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="guest-content">
        {view === 'join' ? (
          <section className="guest-card">
            <div className="guest-card-header">
              <div className="guest-card-icon">👋</div>
              <div>
                <h1 className="guest-card-title">Join this bill</h1>
                <p className="guest-card-subtitle">Enter your name to get started</p>
              </div>
            </div>

            <label className="guest-input-label" htmlFor="nameInput">
              Your Name
            </label>
            <input
              id="nameInput"
              className="guest-input"
              type="text"
              maxLength={30}
              value={joinName}
              onChange={(event) => setJoinName(event.target.value)}
              placeholder="e.g., Rahul"
            />

            <button
              className="guest-button guest-button-primary"
              type="button"
              onClick={() => void handleJoinBill()}
              disabled={joining}
            >
              {joining ? 'Joining...' : "Let's Go"}
            </button>

            <div className="guest-participant-count">{participantCountLabel}</div>
            <div className="guest-participants">
              {participants.map((participant) => (
                <span className="guest-participant-chip" key={participant.userId}>
                  <span className="guest-participant-dot" />
                  {participant.userName}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {view === 'select' ? (
          <section className="guest-card">
            <div className="guest-welcome-banner">
              <div className="guest-welcome-title">Hey, {userName}!</div>
              <div className="guest-welcome-text">
                Tap the items you had. Tax is shared equally.
              </div>
            </div>

            <div className="guest-participant-count">{participantCountLabel}</div>
            <div className="guest-participants">
              {participants.map((participant) => (
                <span className="guest-participant-chip" key={participant.userId}>
                  <span className="guest-participant-dot" />
                  {participant.userName}
                </span>
              ))}
            </div>

            <div className="guest-items-list">
              {billData.items.map((item, index) => {
                const isTax = item.type === 'tax'
                const isDiscount = item.type === 'discount'
                const isSelected = selectedItems.has(index)

                return (
                  <button
                    className={`guest-item ${isSelected ? 'selected' : ''}`}
                    key={`${item.name}-${index}`}
                    type="button"
                    onClick={() => toggleItem(index)}
                    disabled={isTax}
                  >
                    <div className={`guest-item-checkbox ${isTax ? 'disabled' : ''}`}>
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="guest-item-content">
                      <div className="guest-item-name">
                        {item.name}
                        {isTax ? <span className="guest-item-badge tax">Tax</span> : null}
                        {isDiscount ? <span className="guest-item-badge discount">Discount</span> : null}
                      </div>
                    </div>
                    <div className={`guest-item-price ${isDiscount ? 'discount' : ''}`}>
                      {isDiscount ? '-' : ''}
                      {currencySymbol}
                      {Math.abs(item.price).toFixed(2)}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="guest-summary-bar">
              <div>
                <div className="guest-summary-label">Your Selection</div>
                <div className="guest-summary-count">
                  {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="guest-summary-total">
                {currencySymbol}
                {itemSelectionTotal.toFixed(2)}
              </div>
            </div>

            <button
              className="guest-button guest-button-success"
              type="button"
              onClick={() => void handleSubmitSelection()}
              disabled={submitting || selectedItems.size === 0}
            >
              {submitting ? 'Submitting...' : 'Submit Selection'}
            </button>
          </section>
        ) : null}

        {view === 'waiting' ? (
          <section className="guest-card">
            <div className="guest-waiting-card">
              <div className="guest-waiting-icon">⏳</div>
              <div className="guest-waiting-title">Waiting for others...</div>
              <div className="guest-waiting-message">
                Your selection is submitted. Others are still picking their items.
              </div>

              <div className="guest-participants centered">
                {participants.map((participant) => (
                  <span className="guest-participant-chip" key={participant.userId}>
                    <span className="guest-participant-dot" />
                    {participant.userName}
                  </span>
                ))}
              </div>

              <div className="guest-progress-container">
                <div
                  className="guest-progress-fill"
                  style={{ width: `${waitingProgress}%` }}
                />
              </div>
              <div className="guest-progress-text">
                {status.numSubmitted} of {status.expectedUsers} ready
              </div>
            </div>
          </section>
        ) : null}

        {view === 'results' && myResult ? (
          <section className="guest-card">
            <div className="guest-results-hero">
              <div className="guest-results-avatar">
                {myResult.name.charAt(0).toUpperCase()}
              </div>
              <div className="guest-results-name">{myResult.name}</div>
              <div className="guest-results-amount">
                {currencySymbol}
                {myResult.total.toFixed(2)}
              </div>
              <div className="guest-results-label">Your share</div>
            </div>

            <div className="guest-breakdown-section">
              <div className="guest-breakdown-header">
                <div className="guest-breakdown-title">What you're paying for</div>
                <div className="guest-breakdown-count">
                  {myResult.items?.length ?? 0} item{(myResult.items?.length ?? 0) !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="guest-breakdown-list">
                {myResult.items?.length ? (
                  myResult.items.map((item, index) => (
                    <div className="guest-breakdown-item" key={`${item.name}-${index}`}>
                      <div className="guest-breakdown-item-left">
                        <div className="guest-breakdown-item-check">
                          <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <div className="guest-breakdown-item-name">
                          {item.name}
                          {item.type === 'tax' ? (
                            <span className="guest-item-badge tax">Tax</span>
                          ) : null}
                          {item.type === 'discount' ? (
                            <span className="guest-item-badge discount">Discount</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="guest-breakdown-item-price">
                        {currencySymbol}
                        {item.share.toFixed(2)}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="guest-empty-breakdown">No items selected (tax only)</p>
                )}
              </div>
            </div>

            <button
              className="guest-button guest-button-whatsapp"
              type="button"
              onClick={() => setWhatsAppOpen(true)}
            >
              Send Payment Request
            </button>

            {billData.expiresAt ? (
              <div className="guest-expiry-note">
                Link expires at {new Date(billData.expiresAt).toLocaleString()}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {whatsAppOpen ? (
        <div className="guest-modal-overlay" onClick={() => setWhatsAppOpen(false)}>
          <div className="guest-modal" onClick={(event) => event.stopPropagation()}>
            <div className="guest-modal-handle" />
            <h3>Request Payment</h3>
            <div className="guest-modal-subtitle">Send a payment request via WhatsApp</div>
            <div className="guest-modal-amount-display">
              <div className="guest-modal-amount-value">
                {currencySymbol}
                {myResultTotal.toFixed(2)}
              </div>
              <div className="guest-modal-amount-label">Amount to request</div>
            </div>
            <label className="guest-input-label" htmlFor="payerNameInput">
              Who should pay?
            </label>
            <input
              id="payerNameInput"
              className="guest-input"
              type="text"
              maxLength={30}
              value={payerName}
              onChange={(event) => setPayerName(event.target.value)}
              placeholder="Enter their name"
            />
            <div className="guest-modal-footer">
              <button
                className="guest-button guest-button-ghost"
                type="button"
                onClick={() => setWhatsAppOpen(false)}
              >
                Cancel
              </button>
              <button
                className="guest-button guest-button-whatsapp"
                type="button"
                onClick={handleWhatsAppSend}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default SharedBillPage
