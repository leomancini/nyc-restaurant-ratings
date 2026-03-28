import React, { useState, useRef, useCallback, useEffect } from "react";
import styled from "styled-components";

const GRADE_LABELS = {
  A: "A",
  B: "B",
  C: "C",
  Z: "PENDING",
  P: "PENDING",
  N: "N/A",
};

const BORO_NAMES = {
  Manhattan: "MANHATTAN",
  Bronx: "BRONX",
  Brooklyn: "BROOKLYN",
  Queens: "QUEENS",
  "Staten Island": "STATEN ISLAND",
};

const DASHES = "- - - - - - - - - - - - - - - - - -";
const DOTS = ". . . . . . . . . . . . . . . . . .";

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const timerRef = useRef(null);
  const abortRef = useRef(null);

  const search = useCallback(async (q) => {
    if (abortRef.current) abortRef.current.abort();

    if (q.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      const data = await res.json();
      setResults(data.restaurants);
      setLoading(false);
    } catch (e) {
      if (e.name !== "AbortError") {
        setResults([]);
        setLoading(false);
      }
    }
  }, []);

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    setSelected(null);
    clearTimeout(timerRef.current);
    if (val.trim().length < 2) {
      if (abortRef.current) abortRef.current.abort();
      setResults(null);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(() => search(val), 400);
  };

  const selectRestaurant = async (camis, name) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/restaurant/${camis}`);
      const data = await res.json();
      setSelected(data);
      const slug = toSlug(name || data.name);
      window.history.pushState(null, "", `/restaurant/${camis}/${slug}`);
    } catch {
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const goBack = () => {
    setSelected(null);
    window.history.pushState(null, "", "/");
  };

  // Handle slug URLs on load and popstate
  useEffect(() => {
    const loadFromUrl = async () => {
      const path = window.location.pathname;
      const match = path.match(/^\/restaurant\/(\d+)/);
      if (match) {
        const camis = match[1];
        setDetailLoading(true);
        try {
          const res = await fetch(`/api/restaurant/${camis}`);
          const data = await res.json();
          setSelected(data);
        } catch {
          setSelected(null);
        } finally {
          setDetailLoading(false);
        }
      }
    };
    loadFromUrl();

    const onPopState = () => {
      const path = window.location.pathname;
      if (path === "/") {
        setSelected(null);
      } else {
        loadFromUrl();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <Receipt>
      <Paper>
        {!selected && (
          <>
            <ReceiptHeader>
              <StoreName>NYC RESTAURANT RATINGS</StoreName>
              <Divider>{DASHES}</Divider>
              <HeaderDetail>DEPT OF HEALTH & MENTAL HYGIENE</HeaderDetail>
              <HeaderDetail>RESTAURANT INSPECTION RESULTS</HeaderDetail>
              <Divider>{DASHES}</Divider>
            </ReceiptHeader>

            <SearchBox
              type="text"
              placeholder="SEARCH RESTAURANT NAME..."
              value={query}
              onChange={handleInput}
              autoFocus
            />

            {loading && <Status>SEARCHING{dots(3)}</Status>}

            {results && !loading && (
              <>
                {results.length === 0 && (
                  <ResultCount>NO RESULTS FOUND</ResultCount>
                )}
                <ResultsList>
                  {results.map((r, i) => (
                    <ResultItem key={r.camis}>
                      <ResultRow
                        onClick={() => selectRestaurant(r.camis, r.name)}
                      >
                        <ResultLeft>
                          <ItemNumber>{String(i + 1).padStart(2, "0")}</ItemNumber>
                          <ResultDetails>
                            <ItemName>{titleCase(r.name)}</ItemName>
                            <ItemAddress>
                              {r.building} {r.street}
                              {r.boro ? `, ${BORO_NAMES[r.boro] || r.boro}` : ""}
                              {r.zipcode ? ` ${r.zipcode}` : ""}
                            </ItemAddress>
                          </ResultDetails>
                        </ResultLeft>
                        <ResultRight>
                          <GradeBox grade={r.grade}>
                            {r.grade || "-"}
                          </GradeBox>
                          {r.score != null && (
                            <ScoreText>SCR:{r.score}</ScoreText>
                          )}
                        </ResultRight>
                      </ResultRow>
                      <ItemDivider />
                    </ResultItem>
                  ))}
                </ResultsList>
              </>
            )}

            {!results && !loading && (
              <EmptyState>
                <EmptyText>
                  TYPE A RESTAURANT NAME ABOVE
                </EmptyText>
                <EmptyText>TO LOOK UP HEALTH GRADES</EmptyText>
                <Divider>{DASHES}</Divider>
                <LegendSection>
                  <LegendTitle>GRADE SCALE</LegendTitle>
                  <LegendRow>
                    <span>[A]</span>
                    <LegendDots />
                    <span>SCORE 0-13</span>
                  </LegendRow>
                  <LegendRow>
                    <span>[B]</span>
                    <LegendDots />
                    <span>SCORE 14-27</span>
                  </LegendRow>
                  <LegendRow>
                    <span>[C]</span>
                    <LegendDots />
                    <span>SCORE 28+</span>
                  </LegendRow>
                  <LegendNote>* LOWER SCORE = BETTER *</LegendNote>
                </LegendSection>
              </EmptyState>
            )}
          </>
        )}

        {selected && !detailLoading && (
          <Detail>
            <BackButton onClick={goBack}>&lt; BACK TO RESULTS</BackButton>
            <Divider>{DASHES}</Divider>

            <DetailName>{titleCase(selected.name)}</DetailName>
            <DetailLine>{selected.cuisine}</DetailLine>
            <DetailLine>
              {selected.building} {selected.street}
            </DetailLine>
            <DetailLine>
              {BORO_NAMES[selected.boro] || selected.boro}{" "}
              {selected.zipcode}
            </DetailLine>
            {selected.phone && (
              <DetailLine>TEL: {formatPhone(selected.phone)}</DetailLine>
            )}

            <Divider>{DASHES}</Divider>

            {selected.grade && (
              <>
                <GradeReceipt>
                  <GradeReceiptLabel>CURRENT GRADE</GradeReceiptLabel>
                  <GradeBig>{GRADE_LABELS[selected.grade] || selected.grade}</GradeBig>
                  {selected.score != null && (
                    <GradeReceiptRow>
                      <span>INSPECTION SCORE</span>
                      <LegendDots />
                      <span>{selected.score}</span>
                    </GradeReceiptRow>
                  )}
                  {selected.gradeDate && (
                    <GradeReceiptRow>
                      <span>GRADE DATE</span>
                      <LegendDots />
                      <span>{formatDateShort(selected.gradeDate)}</span>
                    </GradeReceiptRow>
                  )}
                </GradeReceipt>
                <Divider>{DASHES}</Divider>
              </>
            )}

            <SectionTitle>INSPECTION HISTORY</SectionTitle>
            <Divider>{DOTS}</Divider>

            {selected.inspections.map((insp, i) => (
              <InspectionBlock key={i}>
                <InspectionHeader>
                  <span>{formatDateShort(insp.date)}</span>
                  <InspectionMeta>
                    {insp.grade && <span>GRADE: {insp.grade}</span>}
                    {insp.score != null && <span>SCR: {insp.score}</span>}
                  </InspectionMeta>
                </InspectionHeader>
                {insp.violations.length > 0 ? (
                  <ViolationsList>
                    {insp.violations.map((v, j) => (
                      <ViolationItem key={j}>
                        <ViolationFlag critical={v.critical}>
                          {v.critical ? "!! CRITICAL" : "   GENERAL "}
                        </ViolationFlag>
                        <ViolationText>{v.description}</ViolationText>
                      </ViolationItem>
                    ))}
                  </ViolationsList>
                ) : (
                  <NoViolations>NO VIOLATIONS RECORDED</NoViolations>
                )}
                {i < selected.inspections.length - 1 && (
                  <Divider>{DOTS}</Divider>
                )}
              </InspectionBlock>
            ))}

            <Divider>{DASHES}</Divider>
          </Detail>
        )}

        {detailLoading && <Status>LOADING{dots(3)}</Status>}

        <Footer>
          <Divider>{DASHES}</Divider>
          <FooterText>DATA: NYC OPEN DATA / DOHMH</FooterText>
          <FooterText>{new Date().toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })} {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</FooterText>
          <FooterText>THANK YOU FOR DINING SAFELY</FooterText>
          <Barcode>||| |||| || ||| | |||| ||| || ||||</Barcode>
        </Footer>
      </Paper>
    </Receipt>
  );
}

function dots(n) {
  return ".".repeat(n);
}

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCase(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

// Styled Components

const Receipt = styled.div`
  min-height: 100vh;
  background: #fff;
`;

const Paper = styled.div`
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: 32px 20px 60px;
`;

const ReceiptHeader = styled.div`
  text-align: center;
  margin-bottom: 24px;
`;

const StoreName = styled.h1`
  font-size: 28px;
  font-weight: 400;
  letter-spacing: 0.5px;
  color: #111;
  margin: 0 0 10px;
`;

const HeaderDetail = styled.div`
  font-size: 16px;
  color: #555;
  letter-spacing: 0.5px;
  line-height: 1.6;
`;

const Divider = styled.div`
  text-align: center;
  color: #bbb;
  font-size: 14px;
  margin: 14px 0;
  letter-spacing: 0.5px;
  overflow: hidden;
  white-space: nowrap;
`;

const SearchBox = styled.input`
  width: 100%;
  padding: 14px 16px;
  font-size: 18px;
  font-family: "Home Video", "Courier New", Courier, monospace;
  border: none;
  outline: none;
  background: #111;
  color: #fff;
  letter-spacing: 0.5px;
  box-sizing: border-box;
  text-transform: uppercase;

  &::placeholder {
    color: #666;
  }
`;

const Status = styled.p`
  text-align: center;
  color: #888;
  margin: 24px 0;
  font-size: 16px;
  letter-spacing: 0.5px;
`;

const ResultCount = styled.p`
  font-size: 16px;
  color: #888;
  margin: 16px 0 6px;
  letter-spacing: 0.5px;
`;

const ResultsList = styled.div`
  display: flex;
  flex-direction: column;
`;

const ResultItem = styled.div``;

const ResultRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  padding: 12px 0;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.02);
  }
`;

const ResultLeft = styled.div`
  display: flex;
  gap: 12px;
  flex: 1;
  min-width: 0;
`;

const ItemNumber = styled.span`
  font-size: 16px;
  color: #aaa;
  flex-shrink: 0;
  padding-top: 2px;
`;

const ResultDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const ItemName = styled.div`
  font-size: 18px;
  color: #111;
  line-height: 1.3;
`;

const ItemMeta = styled.div`
  font-size: 16px;
  color: #777;
  margin-top: 3px;
`;

const ItemAddress = styled.div`
  font-size: 15px;
  color: #999;
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ResultRight = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
`;

const GradeBox = styled.div`
  width: 44px;
  height: 44px;
  border: 2px solid #111;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #111;
`;

const ScoreText = styled.div`
  font-size: 15px;
  color: #888;
  margin-top: 4px;
  letter-spacing: 0.5px;
`;

const ItemDivider = styled.div`
  border-bottom: 1px dotted #ccc;
`;

const EmptyState = styled.div`
  text-align: center;
  margin: 32px 0 16px;
`;

const EmptyText = styled.p`
  color: #888;
  font-size: 16px;
  margin: 6px 0;
  letter-spacing: 0.5px;
`;

const LegendSection = styled.div`
  margin-top: 20px;
  text-align: left;
`;

const LegendTitle = styled.div`
  font-size: 17px;
  color: #555;
  margin-bottom: 10px;
  letter-spacing: 0.5px;
  text-align: center;
`;

const LegendRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 16px;
  color: #555;
  line-height: 2;
`;

const LegendDots = styled.span`
  flex: 1;
  border-bottom: 1px dotted #ccc;
  margin: 0 8px;
  position: relative;
  top: -3px;
`;

const LegendNote = styled.p`
  font-size: 16px;
  color: #999;
  text-align: center;
  margin: 12px 0 0;
  letter-spacing: 0.5px;
`;

// Detail view

const Detail = styled.div``;

const BackButton = styled.button`
  background: none;
  border: none;
  color: #555;
  font-size: 16px;
  font-family: "Home Video", "Courier New", Courier, monospace;
  cursor: pointer;
  padding: 0;
  margin-bottom: 10px;
  letter-spacing: 0.5px;
  text-transform: uppercase;

  &:hover {
    color: #111;
  }
`;

const DetailName = styled.h2`
  font-size: 22px;
  font-weight: 400;
  color: #111;
  margin: 10px 0 6px;
  text-align: center;
`;

const DetailLine = styled.div`
  font-size: 16px;
  color: #666;
  text-align: center;
  line-height: 1.6;
  letter-spacing: 0.5px;
  text-transform: uppercase;
`;

const GradeReceipt = styled.div`
  text-align: center;
  padding: 14px 0;
`;

const GradeReceiptLabel = styled.div`
  font-size: 16px;
  color: #888;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
`;

const GradeBig = styled.div`
  font-size: 80px;
  color: #111;
  line-height: 1;
  margin: 10px 0 16px;
`;

const GradeReceiptRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 17px;
  color: #555;
  line-height: 2;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 400;
  color: #555;
  margin: 10px 0 6px;
  letter-spacing: 0.5px;
  text-align: center;
`;

const InspectionBlock = styled.div`
  margin: 10px 0;
`;

const InspectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 16px;
  color: #333;
  margin-bottom: 8px;
`;

const InspectionMeta = styled.div`
  display: flex;
  gap: 12px;
  font-size: 16px;
  color: #666;
`;

const ViolationsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ViolationItem = styled.div`
  font-size: 16px;
  color: #444;
  line-height: 1.5;
`;

const ViolationFlag = styled.span`
  color: ${(p) => (p.critical ? "#111" : "#888")};
  ${(p) => p.critical && "text-decoration: underline;"}
`;

const ViolationText = styled.span`
  display: block;
  padding-left: 14px;
  color: #555;
  font-size: 15px;
  line-height: 1.5;
`;

const NoViolations = styled.div`
  font-size: 16px;
  color: #aaa;
  letter-spacing: 0.5px;
`;

const Footer = styled.footer`
  text-align: center;
  margin-top: 24px;
`;

const FooterText = styled.div`
  font-size: 15px;
  color: #999;
  letter-spacing: 0.5px;
  line-height: 1.8;
`;

const Barcode = styled.div`
  font-size: 24px;
  letter-spacing: 0.5px;
  color: #111;
  margin-top: 14px;
  line-height: 1;
`;

export default App;
