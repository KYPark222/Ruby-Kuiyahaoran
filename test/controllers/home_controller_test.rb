require "test_helper"

class HomeControllerTest < ActionDispatch::IntegrationTest
  test "renders the board, sample game data, and unconnected controls" do
    get root_path

    assert_response :success
    assert_select "svg.board-component-map"
    assert_select "canvas[data-physics-canvas]"
    assert_select ".physics-rail", count: 3
    assert_select ".lcd-guard", count: 4
    assert_select ".physics-pin", minimum: 90
    assert_select ".physics-pin[cy='363']", count: 0
    assert_select ".physics-pin[cy='404']", count: 0
    assert_select ".physics-pin[cy='320']", count: 9
    assert_select "[data-physics-role='award-gate']", count: 1
    assert_select "section#lcd-interface[data-lcd-state='normal']"
    assert_select "#symbol-reels [data-symbol-column]", count: 3
    assert_select "#lcd-message"
    assert_select "#lcd-holds i", count: 4
    assert_select ".board-callout", count: 6
    assert_select ".money-grid div", count: 4
    assert_select ".stat-grid div", count: 7
    assert_select ".history-list li", count: 3
    assert_select ".strength-button", count: 3
    assert_select ".action-button", count: 4
    assert_select "fieldset[disabled]", count: 2
    assert_select "input[type='range'][id='launch-power']"
    assert_select "input[type='number'][id='target-hit-rate']", count: 1
    assert_select "button[id='apply-target-rate']", count: 1
    assert_select "#target-rate-status", /未設定/
    assert_select "#physics-weak-stats"
    assert_select "#physics-medium-stats"
    assert_select "#physics-strong-stats"
    assert_select "script[src*='game_ui']"
    assert_select "script[src*='matter.min']"
    assert_select "script[src*='pachinko_physics_config']"
    assert_select "script[src*='pachinko_entry_detector']"
    assert_select "script[src*='pachinko_trial_stats']"
    assert_select "script[src*='pachinko_physics']"
    assert_select "body", /持ち玉/
    assert_select "body", /累計払出/
    assert_select "body", /通常回転数/
    assert_select "body", /初当たり/
    assert_select "body", /LUSH突入/
    assert_select "body", /最高連チャン/
    assert_select "body", /累計打ち出し数/
  end
end
