require "test_helper"

class HomeControllerTest < ActionDispatch::IntegrationTest
  test "renders gameplay controls and board" do
    get root_path

    assert_response :success
    assert_select "[aria-label='ゲームプレイ用パチンコ盤面']"
    assert_select "img.game-board-image"
    assert_select "script[src*='game_ui']"
    assert_select ".board-callout", count: 6
    assert_select "input[type='range'][id='launch-power']"
    assert_select "button#launch-toggle", "打ち出し開始"
    assert_select "body", /手持ち玉/
    assert_select "body", /投資/
    assert_select "body", /収支/
  end
end
