import React, { useState, useRef, useCallback } from "react";
import styled from "styled-components";

const GRADE_COLORS = {
  A: "#2E7D32",
  B: "#F57F17",
  C: "#E65100",
  Z: "#9E9E9E",
  P: "#5C6BC0",
  N: "#78909C",
};

const GRADE_LABELS = {
  A: "A",
  B: "B",
  C: "C",
  Z: "Grade Pending",
  P: "Grade Pending",
  N: "Not Yet Graded",
};

const BORO_NAMES = {
  Manhattan: "Manhattan",
  Bronx: "Bronx",
  Brooklyn: "Brooklyn",
  Queens: "Queens",
  "Staten Island": "Staten Island",
};

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const timerRef = useRef(null);

  const search = useCallback(async (q) => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.restaurants);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    setSelected(null);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 300);
  };

  const selectRestaurant = async (camis) => {
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
  };

  const goBack = () => setSelected(null);

  return (
    <Container>
      <Header>
        <Title>NYC Restaurant Ratings</Title>
        <Subtitle>
          Health inspection grades from the NYC Department of Health
        </Subtitle>
      </Header>

      {!selected && (
        <>
          <SearchBox
            type="text"
            placeholder="Search for a restaurant..."
            value={query}
            onChange={handleInput}
            autoFocus
          />

          {loading && <Status>Searching...</Status>}

          {results && !loading && (
            <>
              <ResultCount>
                {results.length === 0
                  ? "No restaurants found"
                  : `${results.length} restaurant${results.length !== 1 ? "s" : ""} found`}
              </ResultCount>
              <ResultsList>
                {results.map((r) => (
                  <ResultCard
                    key={r.camis}
                    onClick={() => selectRestaurant(r.camis)}
                  >
                    <GradeBadge color={GRADE_COLORS[r.grade] || "#BDBDBD"}>
                      {r.grade || "–"}
                    </GradeBadge>
                    <ResultInfo>
                      <RestaurantName>{titleCase(r.name)}</RestaurantName>
                      <RestaurantMeta>
                        {r.cuisine && <span>{r.cuisine}</span>}
                        {r.boro && <span>{BORO_NAMES[r.boro] || r.boro}</span>}
                      </RestaurantMeta>
                      <RestaurantAddress>
                        {r.building} {r.street}
                        {r.zipcode ? `, ${r.zipcode}` : ""}
                      </RestaurantAddress>
                    </ResultInfo>
                    {r.score != null && (
                      <ScorePill score={r.score}>
                        Score: {r.score}
                      </ScorePill>
                    )}
                  </ResultCard>
                ))}
              </ResultsList>
            </>
          )}

          {!results && !loading && (
            <EmptyState>
              <EmptyIcon>🔍</EmptyIcon>
              <EmptyText>
                Search by restaurant name to see their health inspection grade
              </EmptyText>
              <GradeLegend>
                <LegendTitle>Grade Scale</LegendTitle>
                <LegendItems>
                  <LegendItem>
                    <LegendBadge color={GRADE_COLORS.A}>A</LegendBadge>
                    <span>Score 0–13</span>
                  </LegendItem>
                  <LegendItem>
                    <LegendBadge color={GRADE_COLORS.B}>B</LegendBadge>
                    <span>Score 14–27</span>
                  </LegendItem>
                  <LegendItem>
                    <LegendBadge color={GRADE_COLORS.C}>C</LegendBadge>
                    <span>Score 28+</span>
                  </LegendItem>
                </LegendItems>
                <LegendNote>Lower score = fewer violations = better</LegendNote>
              </GradeLegend>
            </EmptyState>
          )}
        </>
      )}

      {selected && !detailLoading && (
        <Detail>
          <BackButton onClick={goBack}>← Back to results</BackButton>
          <DetailHeader>
            <DetailGradeBadge
              color={GRADE_COLORS[selected.grade] || "#BDBDBD"}
            >
              {selected.grade || "–"}
            </DetailGradeBadge>
            <DetailHeaderInfo>
              <DetailName>{titleCase(selected.name)}</DetailName>
              <DetailCuisine>{selected.cuisine}</DetailCuisine>
              <DetailAddress>
                {selected.building} {selected.street},{" "}
                {BORO_NAMES[selected.boro] || selected.boro}{" "}
                {selected.zipcode}
              </DetailAddress>
              {selected.phone && (
                <DetailPhone>{formatPhone(selected.phone)}</DetailPhone>
              )}
            </DetailHeaderInfo>
          </DetailHeader>

          {selected.grade && (
            <GradeSection>
              <GradeLabel>Current Grade</GradeLabel>
              <GradeDisplay>
                <GradeLetter color={GRADE_COLORS[selected.grade]}>
                  {GRADE_LABELS[selected.grade] || selected.grade}
                </GradeLetter>
                {selected.score != null && (
                  <GradeScore>Inspection score: {selected.score}</GradeScore>
                )}
                {selected.gradeDate && (
                  <GradeDate>
                    Graded on {formatDate(selected.gradeDate)}
                  </GradeDate>
                )}
              </GradeDisplay>
            </GradeSection>
          )}

          <InspectionsSection>
            <SectionTitle>Inspection History</SectionTitle>
            {selected.inspections.map((insp, i) => (
              <InspectionCard key={i}>
                <InspectionHeader>
                  <InspectionDate>{formatDate(insp.date)}</InspectionDate>
                  <InspectionMeta>
                    {insp.grade && (
                      <InspectionGrade
                        color={GRADE_COLORS[insp.grade] || "#BDBDBD"}
                      >
                        {insp.grade}
                      </InspectionGrade>
                    )}
                    {insp.score != null && <span>Score: {insp.score}</span>}
                  </InspectionMeta>
                </InspectionHeader>
                {insp.violations.length > 0 && (
                  <ViolationsList>
                    {insp.violations.map((v, j) => (
                      <Violation key={j} critical={v.critical}>
                        <ViolationFlag critical={v.critical}>
                          {v.critical ? "Critical" : "General"}
                        </ViolationFlag>
                        <ViolationText>{v.description}</ViolationText>
                      </Violation>
                    ))}
                  </ViolationsList>
                )}
                {insp.violations.length === 0 && (
                  <NoViolations>No violations recorded</NoViolations>
                )}
              </InspectionCard>
            ))}
          </InspectionsSection>
        </Detail>
      )}

      {detailLoading && <Status>Loading restaurant details...</Status>}
    </Container>
  );
}

function titleCase(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
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

const Container = styled.div`
  max-width: 700px;
  margin: 0 auto;
  padding: 24px 16px 80px;
`;

const Header = styled.header`
  text-align: center;
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 6px;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: #666;
  margin: 0;
`;

const SearchBox = styled.input`
  width: 100%;
  padding: 14px 18px;
  font-size: 17px;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  background: #fafafa;

  &:focus {
    border-color: #1976d2;
    background: #fff;
  }
`;

const Status = styled.p`
  text-align: center;
  color: #888;
  margin-top: 32px;
  font-size: 15px;
`;

const ResultCount = styled.p`
  font-size: 13px;
  color: #888;
  margin: 16px 0 8px;
`;

const ResultsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ResultCard = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid #eee;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;

  &:hover {
    background: #f5f8ff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }
`;

const GradeBadge = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  background: ${(p) => p.color};
  flex-shrink: 0;
`;

const ResultInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const RestaurantName = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RestaurantMeta = styled.div`
  font-size: 13px;
  color: #666;
  margin-top: 2px;
  display: flex;
  gap: 8px;

  span + span::before {
    content: "·";
    margin-right: 8px;
  }
`;

const RestaurantAddress = styled.div`
  font-size: 12px;
  color: #999;
  margin-top: 2px;
`;

const ScorePill = styled.div`
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
  background: ${(p) =>
    p.score <= 13 ? "#E8F5E9" : p.score <= 27 ? "#FFF8E1" : "#FBE9E7"};
  color: ${(p) =>
    p.score <= 13 ? "#2E7D32" : p.score <= 27 ? "#F57F17" : "#E65100"};
`;

const EmptyState = styled.div`
  text-align: center;
  margin-top: 60px;
`;

const EmptyIcon = styled.div`
  font-size: 48px;
  margin-bottom: 12px;
`;

const EmptyText = styled.p`
  color: #888;
  font-size: 15px;
  margin-bottom: 32px;
`;

const GradeLegend = styled.div`
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  display: inline-block;
`;

const LegendTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #666;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const LegendItems = styled.div`
  display: flex;
  gap: 20px;
  justify-content: center;
`;

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #555;
`;

const LegendBadge = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  background: ${(p) => p.color};
`;

const LegendNote = styled.p`
  font-size: 12px;
  color: #999;
  margin: 12px 0 0;
`;

// Detail view

const Detail = styled.div``;

const BackButton = styled.button`
  background: none;
  border: none;
  color: #1976d2;
  font-size: 15px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;

  &:hover {
    text-decoration: underline;
  }
`;

const DetailHeader = styled.div`
  display: flex;
  gap: 18px;
  align-items: flex-start;
  margin-bottom: 24px;
`;

const DetailGradeBadge = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-weight: 800;
  color: #fff;
  background: ${(p) => p.color};
  flex-shrink: 0;
`;

const DetailHeaderInfo = styled.div`
  flex: 1;
`;

const DetailName = styled.h2`
  font-size: 22px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
`;

const DetailCuisine = styled.div`
  font-size: 14px;
  color: #666;
  margin-top: 4px;
`;

const DetailAddress = styled.div`
  font-size: 13px;
  color: #888;
  margin-top: 4px;
`;

const DetailPhone = styled.div`
  font-size: 13px;
  color: #888;
  margin-top: 2px;
`;

const GradeSection = styled.div`
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
`;

const GradeLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

const GradeDisplay = styled.div``;

const GradeLetter = styled.div`
  font-size: 32px;
  font-weight: 800;
  color: ${(p) => p.color};
`;

const GradeScore = styled.div`
  font-size: 14px;
  color: #666;
  margin-top: 4px;
`;

const GradeDate = styled.div`
  font-size: 13px;
  color: #999;
  margin-top: 2px;
`;

const InspectionsSection = styled.div``;

const SectionTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 12px;
`;

const InspectionCard = styled.div`
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 10px;
`;

const InspectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const InspectionDate = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: #333;
`;

const InspectionMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #666;
`;

const InspectionGrade = styled.span`
  font-weight: 700;
  color: ${(p) => p.color};
  font-size: 16px;
`;

const ViolationsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Violation = styled.div`
  font-size: 13px;
  color: #444;
  padding: 8px 10px;
  border-radius: 8px;
  background: ${(p) => (p.critical ? "#FFF3F0" : "#F5F5F5")};
`;

const ViolationFlag = styled.span`
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 8px;
  background: ${(p) => (p.critical ? "#FFCDD2" : "#E0E0E0")};
  color: ${(p) => (p.critical ? "#C62828" : "#555")};
`;

const ViolationText = styled.span`
  line-height: 1.4;
`;

const NoViolations = styled.div`
  font-size: 13px;
  color: #999;
  font-style: italic;
`;

export default App;
